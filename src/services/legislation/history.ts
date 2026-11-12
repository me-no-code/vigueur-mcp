import type { IsoDate } from '../../domain/dates.js';
import type { ArticleRef } from '../../domain/relocation.js';
import { VigueurError } from '../../shared/errors.js';
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
  type Ambiguous,
  ARTICLE_ID,
  blankToNull,
  byStart,
  dedupeById,
  fetchListed,
  invalid,
  type NotFound,
  resolveCitation,
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

export type ArticleHistoryResult = ArticleHistoryView | Ambiguous | NotFound;

export interface GetArticleHistoryInput {
  code?: string;
  number?: string;
  id?: string;
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

type Resolved = { record: ArticleRecord } | { result: Ambiguous | NotFound };

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
      return {
        result: {
          kind: 'not_found',
          reason: 'unknown_id',
          num: null,
          codeTitle: null,
          didYouMean: [],
        },
      };
    }
    return { record };
  }

  const lookup = await resolveCitation(repo, target.number, blankToNull(input.code), today, ctx);
  switch (lookup.kind) {
    case 'in_force':
      return { record: await fetchListed(repo, lookup.hit, today, ctx) };
    case 'periods': {
      // Not in force today (repealed, or not yet in force): history of the latest period,
      // unless the periods span several codes.
      const { num, codeTitle, periods, truncated } = lookup;
      if (codeTitle === null) {
        return {
          result: {
            kind: 'ambiguous',
            num,
            candidates: periods,
            ...(truncated && { possiblyIncomplete: true }),
          },
        };
      }
      const latest = latestHit(periods);
      if (latest === undefined) {
        return {
          result: { kind: 'not_found', reason: 'no_article', num, codeTitle, didYouMean: [] },
        };
      }
      return { record: await fetchListed(repo, latest, latest.validFrom ?? today, ctx) };
    }
    default:
      return { result: lookup };
  }
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
