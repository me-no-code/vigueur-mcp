import type { IsoDate } from '../../domain/dates.js';
import type { ArticleRef } from '../../domain/relocation.js';
import { VigueurError } from '../../shared/errors.js';
import type { GetArticleResult } from './get-article.js';
import type {
  ArticleHit,
  ArticleRecord,
  CallContext,
  Concordance,
  HistoryEntry,
  LegislationRepository,
  VersionSummary,
} from './ports.js';
import {
  ARTICLE_ID,
  blankToNull,
  cleanArticleNumber,
  invalid,
  resolveCode,
  targetOf,
  todayInParis,
} from './resolve.js';

export interface ArticleHistoryView {
  codeTitle: string | null;
  num: string;
  /** The version in force today; `null` when none is (repealed, or not yet in force). */
  current: VersionSummary | null;
  /** Every version of the lineage, by `validFrom` ascending (undetermined starts last). */
  versions: VersionSummary[];
  events: HistoryEntry[];
  /**
   * Concordance of the first version and of the current (else latest) one, merged and
   * de-duplicated by article id. Limitation: a per-version concordance would cost one call per
   * version, so links of intermediate versions are not included.
   */
  concordance: Concordance;
}

export type ArticleHistoryResult =
  | ArticleHistoryView
  | Extract<GetArticleResult, { kind: 'ambiguous' | 'not_found' }>;

export interface GetArticleHistoryInput {
  code?: string;
  number?: string;
  id?: string;
}

const HITS_PAGE_SIZE = 20;

const startKey = (v: { validFrom: IsoDate | null }) => v.validFrom ?? '9999-12-31';
const byStart = (a: { validFrom: IsoDate | null }, b: { validFrom: IsoDate | null }) =>
  startKey(a).localeCompare(startKey(b));

function dedupeById<T extends { id: string }>(items: readonly T[]): T[] {
  const byId = new Map<string, T>();
  for (const i of items) if (!byId.has(i.id)) byId.set(i.id, i);
  return [...byId.values()];
}

function inForceOn(v: VersionSummary, date: IsoDate): boolean {
  return (
    v.status !== 'stillborn' &&
    v.validFrom !== null &&
    v.validFrom <= date &&
    (v.validTo === null || date < v.validTo)
  );
}

const mergeConcordance = (parts: readonly Concordance[]): Concordance => ({
  from: dedupeById<ArticleRef>(parts.flatMap((p) => p.from)),
  to: dedupeById<ArticleRef>(parts.flatMap((p) => p.to)),
});

/** The latest period of a lineage: greatest start, a still-born version only as a last resort. */
function latestHit(hits: readonly ArticleHit[]): ArticleHit | undefined {
  const real = hits.filter((h) => h.status !== 'stillborn');
  return [...(real.length > 0 ? real : hits)].sort(byStart).at(-1);
}

type Resolved =
  | { record: ArticleRecord }
  | { result: Extract<GetArticleResult, { kind: 'ambiguous' | 'not_found' }> };

async function fetchRecord(
  repo: LegislationRepository,
  hit: ArticleHit,
  asOf: IsoDate,
  ctx: CallContext | undefined,
): Promise<ArticleRecord> {
  const record = await repo.getArticle(hit.id, asOf, ctx);
  if (record === null) {
    throw new VigueurError(
      'upstream_unavailable',
      `Légifrance lists article ${hit.num} (${hit.id}) but did not return it. Try again later.`,
      { source: 'legifrance' },
    );
  }
  return record;
}

async function resolve(
  repo: LegislationRepository,
  input: GetArticleHistoryInput,
  today: IsoDate,
  ctx: CallContext | undefined,
): Promise<Resolved> {
  const target = targetOf(input);
  if ('id' in target) {
    if (!ARTICLE_ID.test(target.id)) {
      throw invalid(
        `"${target.id}" is not a supported article id. Use LEGIARTI/KALIARTI + 12 digits, or give the code and article number instead.`,
      );
    }
    const record = await repo.getArticle(target.id, today, ctx);
    if (record === null) {
      return { result: { kind: 'not_found', num: null, codeTitle: null, didYouMean: [] } };
    }
    return { record };
  }

  const num = cleanArticleNumber(target.number);
  const rawCode = blankToNull(input.code);
  let codeTitle: string | null = null;
  if (rawCode !== null) {
    const resolved = await resolveCode(repo, rawCode, ctx);
    if (resolved.code === null) {
      return {
        result: { kind: 'not_found', num, codeTitle: rawCode, didYouMean: resolved.didYouMean },
      };
    }
    codeTitle = resolved.code.title;
  }

  const page = await repo.findArticleAt(codeTitle, num, today, ctx);
  const inForce = dedupeById(page);
  const ambiguous = (candidates: ArticleHit[], possiblyIncomplete: boolean) => ({
    result: {
      kind: 'ambiguous' as const,
      num,
      candidates,
      ...(possiblyIncomplete && { possiblyIncomplete: true as const }),
    },
  });
  if (inForce.length > 1) {
    const codes = new Set(inForce.map((h) => h.codeTitle));
    // Several in-force versions inside one code share a lineage only when they are the same
    // article; otherwise list them, never pick one.
    if (codes.size > 1 || new Set(inForce.map((h) => h.id)).size > 1) {
      return ambiguous(inForce, page.length >= HITS_PAGE_SIZE);
    }
  }
  const [hit] = inForce;
  if (hit !== undefined) return { record: await fetchRecord(repo, hit, today, ctx) };

  // Not in force today (repealed, or not yet in force): history of the latest period.
  const all = dedupeById(await repo.findArticleAllVersions(codeTitle, num, ctx));
  if (all.length === 0) return { result: { kind: 'not_found', num, codeTitle, didYouMean: [] } };
  if (new Set(all.map((h) => h.codeTitle)).size > 1) {
    return ambiguous([...all].sort(byStart), all.length >= HITS_PAGE_SIZE);
  }
  const latest = latestHit(all);
  if (latest === undefined)
    return { result: { kind: 'not_found', num, codeTitle, didYouMean: [] } };
  return { record: await fetchRecord(repo, latest, latest.validFrom ?? today, ctx) };
}

/**
 * The version stack, amendment events and concordance of an article. Resolves like
 * `getArticle` at today's date; an article not in force today falls back to its latest period,
 * so repealed articles still get their history.
 */
export function createGetArticleHistory(
  repo: LegislationRepository,
  opts: { today?: () => IsoDate } = {},
): (input: GetArticleHistoryInput, ctx?: CallContext) => Promise<ArticleHistoryResult> {
  const todayOf = opts.today ?? todayInParis;
  return async (input, ctx) => {
    const today = todayOf();
    const resolved = await resolve(repo, input, today, ctx);
    if ('result' in resolved) return resolved.result;
    const { record } = resolved;

    const versions = [...record.versions].sort(byStart);
    const current = versions.find((v) => inForceOn(v, today)) ?? null;
    const first = versions[0];
    const latest = current ?? versions.at(-1);
    const concordanceIds = [
      ...new Set([first?.id ?? record.version.id, latest?.id ?? record.version.id]),
    ];

    if (record.codeId === null) {
      throw new VigueurError(
        'upstream_unavailable',
        `Légifrance did not say which code article ${record.version.number} belongs to, so its history cannot be read.`,
        { source: 'legifrance' },
      );
    }
    const [events, concordances] = await Promise.all([
      repo.getArticleHistory(record.codeId, record.cid, ctx),
      Promise.all(concordanceIds.map((id) => repo.getConcordance(id, ctx))),
    ]);

    return {
      codeTitle: record.codeTitle,
      num: record.version.number,
      current,
      versions,
      events,
      concordance: mergeConcordance(concordances),
    };
  };
}
