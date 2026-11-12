import type { IsoDate } from '../../domain/dates.js';
import { articleUrlFor } from '../../domain/links.js';
import { assessRelocation, type Relocation } from '../../domain/relocation.js';
import { consistencyWarnings, type StatusAt, statusAt } from '../../domain/status-at.js';
import { VigueurError } from '../../shared/errors.js';
import type {
  ArticleHit,
  ArticleRecord,
  CallContext,
  LegislationRepository,
  VersionSummary,
} from './ports.js';
import {
  ARTICLE_ID,
  blankToNull,
  cleanArticleNumber,
  invalid,
  requireIsoDate,
  resolveCode,
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
}

export interface RelocationView extends Relocation {
  /** The version that was found. */
  from: VersionSummary;
  /** The next version of the same lineage, whose content is compared with `from`. */
  successor: VersionSummary | null;
}

export interface ArticleView {
  record: ArticleRecord;
  asOf: IsoDate;
  statusAt: StatusAt;
  warnings: string[];
  url: string;
  relocation: RelocationView | null;
}

export type GetArticleResult =
  | { kind: 'found'; article: ArticleView }
  | {
      kind: 'ambiguous';
      num: string;
      candidates: ArticleHit[];
      /** The lookup reads one page of hits; when it is full, more candidates may exist. */
      possiblyIncomplete?: boolean;
    }
  | {
      kind: 'not_in_force_at_date';
      num: string;
      codeTitle: string | null;
      asOf: IsoDate;
      periods: ArticleHit[];
    }
  | { kind: 'not_found'; num: string | null; codeTitle: string | null; didYouMean: string[] };

/** Hits per by-number lookup: the client reads the first page of `/search` only. */
const HITS_PAGE_SIZE = 20;

function dedupeById(hits: readonly ArticleHit[]): ArticleHit[] {
  const byId = new Map<string, ArticleHit>();
  for (const h of hits) if (!byId.has(h.id)) byId.set(h.id, h);
  return [...byId.values()];
}

/** The code every hit belongs to, when they share one. */
function sharedCodeTitle(hits: readonly ArticleHit[]): string | null {
  const titles = new Set(hits.map((h) => h.codeTitle));
  return titles.size === 1 ? (hits[0]?.codeTitle ?? null) : null;
}

const byValidFrom = (a: ArticleHit, b: ArticleHit) =>
  (a.validFrom ?? '').localeCompare(b.validFrom ?? '');

function ownSummary(record: ArticleRecord): VersionSummary {
  const listed = record.versions.find((v) => v.id === record.version.id);
  if (listed) return listed;
  const { id, status, rawStatus, validFrom, validTo } = record.version;
  return { id, version: '', status, rawStatus: rawStatus ?? '', validFrom, validTo };
}

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

/** Amended or replaced, and where the content moved (per Légifrance concordance). */
async function relocationOf(
  repo: LegislationRepository,
  record: ArticleRecord,
  ctx: CallContext | undefined,
): Promise<RelocationView | null> {
  const successor = successorOf(record);
  if (successor === null) return null;
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

const isCancellation = (err: unknown) => err instanceof VigueurError && err.kind === 'cancelled';
const reasonOf = (err: unknown) =>
  (err instanceof Error ? err.message : String(err)).replace(/\.$/, '');

async function found(
  repo: LegislationRepository,
  record: ArticleRecord,
  asOf: IsoDate,
  ctx: CallContext | undefined,
): Promise<GetArticleResult> {
  const warnings = consistencyWarnings(record.version, record.modifications, asOf);
  // The relocation is extra information: its failure must not hide the article itself.
  let relocation: RelocationView | null = null;
  try {
    relocation = await relocationOf(repo, record, ctx);
  } catch (err) {
    if (isCancellation(err)) throw err;
    warnings.push(`Could not check where this content moved (${reasonOf(err)}).`);
  }
  const article: ArticleView = {
    record,
    asOf,
    statusAt: statusAt(record.version, asOf),
    warnings,
    url: articleUrlFor(record.version.id),
    relocation,
  };
  return { kind: 'found', article };
}

async function byId(
  repo: LegislationRepository,
  id: string,
  asOf: IsoDate,
  ctx: CallContext | undefined,
): Promise<GetArticleResult> {
  if (!ARTICLE_ID.test(id)) {
    throw invalid(
      `"${id}" is not a supported article id. Use a code article id (LEGIARTI + 12 digits) or a collective agreement article id (KALIARTI + 12 digits), or give the code and article number instead (e.g. code "Code civil", number "1240").`,
    );
  }
  const record = await repo.getArticle(id, asOf, ctx);
  if (record === null) return { kind: 'not_found', num: null, codeTitle: null, didYouMean: [] };
  return found(repo, record, asOf, ctx);
}

async function byCitation(
  repo: LegislationRepository,
  rawNumber: string,
  rawCode: string | null,
  asOf: IsoDate,
  ctx: CallContext | undefined,
): Promise<GetArticleResult> {
  const num = cleanArticleNumber(rawNumber);
  let codeTitle: string | null = null;
  if (rawCode !== null) {
    const resolved = await resolveCode(repo, rawCode, ctx);
    if (resolved.code === null) {
      return { kind: 'not_found', num, codeTitle: rawCode, didYouMean: resolved.didYouMean };
    }
    codeTitle = resolved.code.title;
  }

  const page = await repo.findArticleAt(codeTitle, num, asOf, ctx);
  const hits = dedupeById(page);
  if (hits.length > 1) {
    // Several codes, or several versions in one code: list them, never pick one.
    return {
      kind: 'ambiguous',
      num,
      candidates: hits,
      ...(page.length >= HITS_PAGE_SIZE && { possiblyIncomplete: true }),
    };
  }
  const [hit] = hits;
  if (hit !== undefined) {
    const record = await repo.getArticle(hit.id, asOf, ctx);
    if (record === null) {
      throw new VigueurError(
        'upstream_unavailable',
        `Légifrance lists article ${hit.num} (${hit.id}) but did not return it. Try again later.`,
        { source: 'legifrance' },
      );
    }
    return found(repo, record, asOf, ctx);
  }

  // Nothing in force on that date: repealed, not yet in force, or never existed?
  const periods = await repo.findArticleAllVersions(codeTitle, num, ctx);
  if (periods.length === 0) return { kind: 'not_found', num, codeTitle, didYouMean: [] };
  return {
    kind: 'not_in_force_at_date',
    num,
    codeTitle: codeTitle ?? sharedCodeTitle(periods),
    asOf,
    periods: [...periods].sort(byValidFrom),
  };
}

/**
 * Resolves an article by citation (code + number) or by id, as of a date (default: today in Paris):
 * - a number found in several codes is `ambiguous` (candidates listed, never one picked);
 * - a number with no version in force on the date but other versions on record is
 *   `not_in_force_at_date` (e.g. repealed), never `not_found`;
 * - a found version followed by another one says whether its content was amended or
 *   replaced, and where it moved per Légifrance concordance. Best effort: a failure of
 *   that check becomes a warning (only a cancellation fails the lookup).
 */
export function createGetArticle(
  repo: LegislationRepository,
  opts: { today?: () => IsoDate } = {},
): (input: GetArticleInput, ctx?: CallContext) => Promise<GetArticleResult> {
  const today = opts.today ?? todayInParis;
  return async (input, ctx) => {
    const target = targetOf(input);
    const asOf = input.atDate === undefined ? today() : requireIsoDate(input.atDate);
    if ('id' in target) return byId(repo, target.id, asOf, ctx);
    return byCitation(repo, target.number, blankToNull(input.code), asOf, ctx);
  };
}
