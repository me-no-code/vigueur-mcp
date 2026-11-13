import type { IsoDate } from '../../domain/dates.js';
import { articleUrlFor } from '../../domain/links.js';
import { type ArticleRef, assessRelocation, type Relocation } from '../../domain/relocation.js';
import {
  consistencyWarnings,
  coversDate,
  type StatusAt,
  statusAt,
} from '../../domain/status-at.js';
import type {
  ArticleHit,
  ArticleRecord,
  CallContext,
  LegislationRepository,
  VersionSummary,
} from './ports.js';
import {
  type Ambiguous,
  ARTICLE_ID,
  bestEffort,
  blankToNull,
  fetchListed,
  invalid,
  latestPeriod,
  type NotFound,
  ownSummary,
  requireIsoDate,
  resolveCitation,
  targetOf,
  todayInParis,
} from './resolve.js';

export interface GetArticleInput {
  code?: string;
  /** Article number as people write it (`L. 1234-1`, `art. 1240`…); excludes `id`. */
  number?: string;
  /** Légifrance article id (`LEGIARTI…` / `KALIARTI…`); excludes `number`; `code` is then ignored. */
  id?: string;
  atDate?: IsoDate;
  /** Also give the previous and next article of the same section. */
  includeNeighbours?: boolean;
}

export interface RelocationView extends Relocation {
  /** The version that was found. */
  from: VersionSummary;
  /**
   * The next version of the same lineage, whose content is compared with `from`. `null` when
   * the found version ended (or is recorded as repealed) with no later version: `movedTo` then
   * comes from Légifrance concordance alone and `change` is 'replaced'.
   */
  successor: VersionSummary | null;
}

/** Where the content of the latest period of a number went, per Légifrance concordance. */
export interface PeriodRelocation {
  /** The latest period: an ended version whose concordance was read. */
  from: ArticleHit;
  movedTo: ArticleRef[];
}

export interface Neighbour {
  id: string;
  num: string;
  /** First 200 characters of the article's text. */
  excerpt: string;
  url: string;
}

export interface ArticleView {
  record: ArticleRecord;
  asOf: IsoDate;
  statusAt: StatusAt;
  warnings: string[];
  url: string;
  relocation: RelocationView | null;
  neighbours?: { previous: Neighbour | null; next: Neighbour | null };
}

export type GetArticleResult =
  | { kind: 'found'; article: ArticleView }
  | Ambiguous
  | {
      kind: 'not_in_force_at_date';
      num: string;
      codeTitle: string | null;
      asOf: IsoDate;
      /** Oldest first, unknown starts last. */
      periods: ArticleHit[];
      /** E.g. a period whose dates cover `asOf` although the dated search found none. */
      warnings: string[];
      /** Present when the latest period ended and Légifrance concordance says where it went. */
      relocation?: PeriodRelocation;
    }
  | NotFound;

type DatedVersion = VersionSummary & { validFrom: IsoDate };

/** The earliest version starting after the found one; still-born versions never applied. */
function successorOf(record: ArticleRecord): DatedVersion | null {
  const later = record.versions.filter(
    (v): v is DatedVersion =>
      v.status !== 'stillborn' && v.validFrom !== null && v.validFrom > record.version.validFrom,
  );
  return later.reduce<DatedVersion | null>(
    (next, v) => (next === null || v.validFrom < next.validFrom ? v : next),
    null,
  );
}

const MOVE_WARNING = (reason: string) => `Could not check where this content moved (${reason}).`;

/**
 * A found version with no later one: where its content went, from the concordance alone, when
 * it ended or Légifrance records its abrogation (whatever its status label says).
 */
async function endedRelocation(
  repo: LegislationRepository,
  record: ArticleRecord,
  ctx: CallContext | undefined,
): Promise<RelocationView | null> {
  const { version } = record;
  const ended =
    version.validTo !== null || record.modifications.some((m) => m.kind === 'abrogation');
  if (!ended) return null;
  const concordance = await repo.getConcordance(version.id, ctx);
  if (concordance.to.length === 0) return null;
  return {
    change: 'replaced',
    movedTo: concordance.to,
    evidence: ['concordance'],
    from: ownSummary(record),
    successor: null,
  };
}

/** Amended or replaced, and where the content moved (per Légifrance concordance). */
async function relocationOf(
  repo: LegislationRepository,
  record: ArticleRecord,
  ctx: CallContext | undefined,
): Promise<RelocationView | null> {
  const successor = successorOf(record);
  if (successor === null) return endedRelocation(repo, record, ctx);
  const [concordance, later] = await Promise.all([
    repo.getConcordance(record.version.id, ctx),
    repo.getArticle(successor.id, successor.validFrom, ctx),
  ]);
  const from = ownSummary(record);
  if (later === null) {
    // No later text to compare: only the concordance (a source fact) can say the content moved,
    // which means the text now under this number is not the same content ('replaced').
    if (concordance.to.length === 0) return null;
    return {
      change: 'replaced',
      movedTo: concordance.to,
      evidence: ['concordance'],
      from,
      successor,
    };
  }
  const relocation = assessRelocation({
    earlierText: record.version.text,
    laterText: later.version.text,
    concordanceTo: concordance.to,
    sectionChanged: later.sectionPath.at(-1) !== record.sectionPath.at(-1),
  });
  return { ...relocation, from, successor };
}

const EXCERPT_LENGTH = 200;
const NEIGHBOURS_WARNING = (reason: string) =>
  `Could not read the neighbouring articles (${reason}).`;

async function neighbourOf(
  repo: LegislationRepository,
  id: string,
  asOf: IsoDate,
  warnings: string[],
  ctx: CallContext | undefined,
): Promise<Neighbour | null> {
  const record = await bestEffort(
    async () => {
      const r = await repo.getArticle(id, asOf, ctx);
      if (r === null) throw new Error('not returned by Légifrance');
      return r;
    },
    warnings,
    (reason) => `Could not read the neighbouring article ${id} (${reason}).`,
  );
  if (record === null) return null;
  return {
    id,
    num: record.version.number,
    excerpt: record.version.text.slice(0, EXCERPT_LENGTH),
    url: articleUrlFor(id),
  };
}

/** The articles just before and after this one in its section (links valid on `asOf`). */
async function neighboursOf(
  repo: LegislationRepository,
  record: ArticleRecord,
  asOf: IsoDate,
  warnings: string[],
  ctx: CallContext | undefined,
): Promise<{ previous: Neighbour | null; next: Neighbour | null }> {
  const none = { previous: null, next: null };
  if (record.sectionCid === null) {
    warnings.push('Neighbouring articles unavailable: the article has no known section.');
    return none;
  }
  const sectionCid = record.sectionCid;
  const links = await bestEffort(
    async () => {
      const l = await repo.getSectionLinks(sectionCid, ctx);
      if (l === null) throw new Error('its section is unknown to Légifrance');
      return l;
    },
    warnings,
    NEIGHBOURS_WARNING,
  );
  if (links === null) return none;
  const ids = links.articles.filter((a) => statusAt(a, asOf).inForce).map((a) => a.id);
  const at = ids.indexOf(record.version.id);
  if (at < 0) {
    warnings.push('Neighbouring articles unavailable: the article was not found in its section.');
    return none;
  }
  const [previousId, nextId] = [ids[at - 1], ids[at + 1]];
  const [previous, next] = await Promise.all([
    previousId === undefined ? null : neighbourOf(repo, previousId, asOf, warnings, ctx),
    nextId === undefined ? null : neighbourOf(repo, nextId, asOf, warnings, ctx),
  ]);
  return { previous, next };
}

async function found(
  repo: LegislationRepository,
  record: ArticleRecord,
  asOf: IsoDate,
  ctx: CallContext | undefined,
  includeNeighbours = false,
): Promise<GetArticleResult> {
  const warnings = consistencyWarnings(record.version, record.modifications, asOf);
  if (record.version.validToUndetermined === true) {
    warnings.push('Repeal scheduled; Légifrance has not set its date.');
  }
  // The relocation is extra information: its failure must not hide the article itself.
  const relocation = await bestEffort(
    () => relocationOf(repo, record, ctx),
    warnings,
    MOVE_WARNING,
  );
  const article: ArticleView = {
    record,
    asOf,
    statusAt: statusAt(record.version, asOf),
    warnings,
    url: articleUrlFor(record.version.id),
    relocation,
  };
  if (includeNeighbours) {
    article.neighbours = await neighboursOf(repo, record, asOf, warnings, ctx);
  }
  return { kind: 'found', article };
}

async function byId(
  repo: LegislationRepository,
  id: string,
  asOf: IsoDate,
  ctx: CallContext | undefined,
  includeNeighbours: boolean,
): Promise<GetArticleResult> {
  if (!ARTICLE_ID.test(id)) {
    throw invalid(
      `"${id}" is not a supported article id. Use a code article id (LEGIARTI + 12 digits) or a collective agreement article id (KALIARTI + 12 digits), or give the code and article number instead (e.g. code "Code civil", number "1240").`,
    );
  }
  const record = await repo.getArticle(id, asOf, ctx);
  if (record === null) {
    return { kind: 'not_found', reason: 'unknown_id', num: null, codeTitle: null, didYouMean: [] };
  }
  return found(repo, record, asOf, ctx, includeNeighbours);
}

/** The dated search and the dates disagree: never silently claim "not in force". */
function coverWarning(p: ArticleHit, asOf: IsoDate): string {
  const end = p.validTo ?? (p.validToUndetermined ? 'date not yet determined' : 'no end');
  return `Légifrance's dated search found no version for ${asOf}, but this period covers it: ${p.rawStatus || p.status} ${p.validFrom} → ${end} (${p.id}).`;
}

/** Where the content of the latest period went, when that period ended (best effort). */
async function periodRelocation(
  repo: LegislationRepository,
  periods: readonly ArticleHit[],
  warnings: string[],
  ctx: CallContext | undefined,
): Promise<PeriodRelocation | null> {
  const last = latestPeriod(periods);
  if (last === undefined || last.status === 'stillborn' || last.validTo === null) return null;
  const concordance = await bestEffort(
    () => repo.getConcordance(last.id, ctx),
    warnings,
    MOVE_WARNING,
  );
  if (concordance === null || concordance.to.length === 0) return null;
  return { from: last, movedTo: concordance.to };
}

async function byCitation(
  repo: LegislationRepository,
  rawNumber: string,
  rawCode: string | null,
  asOf: IsoDate,
  ctx: CallContext | undefined,
  includeNeighbours: boolean,
): Promise<GetArticleResult> {
  const lookup = await resolveCitation(repo, rawNumber, rawCode, asOf, ctx);
  switch (lookup.kind) {
    case 'in_force':
      return found(
        repo,
        await fetchListed(repo, lookup.hit, asOf, ctx),
        asOf,
        ctx,
        includeNeighbours,
      );
    case 'periods': {
      // Nothing in force on that date, but versions on record: repealed, or not yet in force.
      const { num, codeTitle, periods } = lookup;
      const warnings = periods.filter((p) => coversDate(p, asOf)).map((p) => coverWarning(p, asOf));
      const relocation =
        codeTitle === null ? null : await periodRelocation(repo, periods, warnings, ctx);
      return {
        kind: 'not_in_force_at_date',
        num,
        codeTitle,
        asOf,
        periods,
        warnings,
        ...(relocation !== null && { relocation }),
      };
    }
    default:
      return lookup;
  }
}

/**
 * Resolves an article by citation (code + number) or by id, as of a date (default: today in Paris):
 * - a number found in several codes is `ambiguous` (candidates listed, never one picked);
 * - a number with no version in force on the date but other versions on record is
 *   `not_in_force_at_date` (e.g. repealed), never `not_found`; when its latest period ended,
 *   it says where that content went per Légifrance concordance;
 * - a found version followed by another one says whether its content was amended or
 *   replaced, and where it moved per Légifrance concordance; one that ended (or is recorded
 *   as repealed) with no later version says where its content went, per concordance only.
 *   Best effort: a failure of these checks becomes a warning (only a cancellation fails the
 *   lookup).
 */
export function createGetArticle(
  repo: LegislationRepository,
  opts: { today?: () => IsoDate } = {},
): (input: GetArticleInput, ctx?: CallContext) => Promise<GetArticleResult> {
  const today = opts.today ?? todayInParis;
  return async (input, ctx) => {
    const target = targetOf(input);
    const asOf = input.atDate === undefined ? today() : requireIsoDate(input.atDate);
    const neighbours = input.includeNeighbours === true;
    if ('id' in target) return byId(repo, target.id, asOf, ctx, neighbours);
    return byCitation(repo, target.number, blankToNull(input.code), asOf, ctx, neighbours);
  };
}
