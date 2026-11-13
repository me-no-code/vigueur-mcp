import type { IsoDate } from '../../domain/dates.js';
import type { ArticleRef } from '../../domain/relocation.js';
import { coversDate } from '../../domain/status-at.js';
import { VigueurError } from '../../shared/errors.js';
import type {
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
  bestEffort,
  blankToNull,
  byStart,
  dedupeById,
  fetchListed,
  invalid,
  latestPeriod,
  type NotFound,
  ownSummary,
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
   * Légifrance concordance, read for the first version and the current (else latest) one.
   * Limitation: a per-version concordance costs one call per version, so links of
   * intermediate versions are not included.
   */
  concordance: HistoryConcordance;
  /** E.g. a concordance that could not be read (the history still stands without it). */
  warnings: string[];
}

/** Where the content of one version now lives, per Légifrance concordance. */
export interface VersionMove {
  version: VersionSummary;
  to: ArticleRef[];
}

export interface HistoryConcordance {
  /**
   * Articles whose content now lives at this article number, merged by id. Légifrance attaches
   * these links to every version of the lineage (old 1240 lists 1382 too), so they describe the
   * number's current content, not one version.
   */
  from: ArticleRef[];
  /** Where a version's content moved, scoped to that version (old 1240's content → 1342-3). */
  moved: VersionMove[];
}

export type ArticleHistoryResult = ArticleHistoryView | Ambiguous | NotFound;

export interface GetArticleHistoryInput {
  code?: string;
  number?: string;
  id?: string;
}

/** Per-version moves; the "came from" links merged (see `HistoryConcordance`). */
function historyConcordance(
  read: ReadonlyArray<{ version: VersionSummary; concordance: Concordance | null }>,
): HistoryConcordance {
  return {
    from: dedupeById<ArticleRef>(read.flatMap((r) => r.concordance?.from ?? [])),
    moved: read.flatMap(({ version, concordance }) =>
      concordance !== null && concordance.to.length > 0 ? [{ version, to: concordance.to }] : [],
    ),
  };
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
      const latest = latestPeriod(periods);
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
 * so repealed articles still get their history. The concordance is best effort: a failure
 * becomes a warning, only a cancellation fails the call.
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
    const current = versions.find((v) => coversDate(v, today)) ?? null;
    const own = ownSummary(record);
    const concordanceOf = dedupeById([versions[0] ?? own, current ?? versions.at(-1) ?? own]);

    if (record.codeId === null) {
      throw new VigueurError(
        'upstream_unavailable',
        `Légifrance did not say which code article ${record.version.number} belongs to, so its history cannot be read.`,
        { source: 'legifrance' },
      );
    }
    // The concordance only adds information: a failure becomes a warning.
    const warnings: string[] = [];
    const read = (version: VersionSummary) =>
      bestEffort(
        () => repo.getConcordance(version.id, ctx),
        warnings,
        (reason) => `Could not read Légifrance's concordance of ${version.id} (${reason}).`,
      ).then((concordance) => ({ version, concordance }));
    const [events, concordances] = await Promise.all([
      repo.getArticleHistory(record.codeId, record.cid, ctx),
      Promise.all(concordanceOf.map(read)),
    ]);

    return {
      codeTitle: record.codeTitle,
      num: record.version.number,
      current,
      versions,
      events,
      concordance: historyConcordance(concordances),
      warnings,
    };
  };
}
