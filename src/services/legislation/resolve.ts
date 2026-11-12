import { normalizeArticleNumber } from '../../domain/articles.js';
import { resolveCodeName } from '../../domain/codes.js';
import { type IsoDate, isIsoDate, isoDateInParis } from '../../domain/dates.js';
import { foldKey } from '../../domain/text.js';
import { VigueurError } from '../../shared/errors.js';
import type {
  ArticleHit,
  ArticleRecord,
  CallContext,
  CodeInfo,
  LegislationRepository,
} from './ports.js';

const MAX_CODE_SUGGESTIONS = 5;

export const ARTICLE_ID = /^(LEGIARTI|KALIARTI)\d{12}$/;

export const invalid = (message: string) => new VigueurError('invalid_input', message);

/** Trimmed string, or `null` when absent or blank. */
export function blankToNull(s: string | undefined): string | null {
  const t = s?.trim();
  return t === undefined || t === '' ? null : t;
}

/** `Art. L. 1234-1` → `L1234-1`: drops a leading "article" / "art." then normalizes. */
export function cleanArticleNumber(raw: string): string {
  const num = normalizeArticleNumber(raw.trim().replace(/^(?:article|art)\.?\s*/i, ''));
  if (num === '') {
    throw invalid(`"${raw}" is not an article number. Example: number "L1234-1" or "1240".`);
  }
  return num;
}

export type CodeResolution = { code: CodeInfo } | { code: null; didYouMean: string[] };

/**
 * The code whose title folds equal to the input (or to the title its abbreviation stands for).
 * Otherwise up to five titles containing the input, as suggestions only — never substituted.
 */
export async function resolveCode(
  repo: LegislationRepository,
  raw: string,
  ctx: CallContext | undefined,
): Promise<CodeResolution> {
  const wanted = foldKey(resolveCodeName(raw) ?? raw);
  const codes = await repo.listCodes(ctx);
  const code = codes.find((c) => foldKey(c.title) === wanted);
  if (code) return { code };

  const typed = foldKey(raw);
  if (typed === '') return { code: null, didYouMean: [] };
  const didYouMean = codes
    .map((c) => c.title)
    .filter((title) => foldKey(title).includes(typed))
    .sort((a, b) => a.localeCompare(b, 'fr'))
    .slice(0, MAX_CODE_SUGGESTIONS);
  return { code: null, didYouMean };
}

export const todayInParis = (): IsoDate => isoDateInParis(new Date());

/** Throws `invalid_input` unless `value` is a real `YYYY-MM-DD` date. */
export function requireIsoDate(value: string, label?: string): IsoDate {
  if (!isIsoDate(value)) {
    throw invalid(
      `${label ? `${label}: ` : ''}"${value}" is not a valid date: use a real date as YYYY-MM-DD.`,
    );
  }
  return value;
}

/** What the caller asked for: exactly one of a number or an id. */
export function targetOf(input: {
  number?: string;
  id?: string;
}): { id: string } | { number: string } {
  const number = blankToNull(input.number);
  const id = blankToNull(input.id);
  if (number !== null && id !== null) {
    throw invalid('Give either an article number or an article id, not both.');
  }
  if (id !== null) return { id };
  if (number !== null) return { number };
  throw invalid(
    'Give an article number with its code (e.g. code "Code civil", number "1240") or a Légifrance article id (LEGIARTI…).',
  );
}

// ---------------------------------------------------------------------------------------------
// Citation resolution, shared by get_article and get_article_history.

/**
 * Why nothing was found: `unknown_code` (no code has the given title: nothing was searched),
 * `no_article` (no version of the number was ever on record), `unknown_id` (no article has the id).
 */
export type NotFoundReason = 'unknown_code' | 'no_article' | 'unknown_id';

export interface NotFound {
  kind: 'not_found';
  reason: NotFoundReason;
  num: string | null;
  /** The code as typed for `unknown_code`; otherwise its official title (`null`: every code). */
  codeTitle: string | null;
  /** Code titles containing the input, for `unknown_code`: suggestions, never substituted. */
  didYouMean: string[];
}

export interface Ambiguous {
  kind: 'ambiguous';
  num: string;
  candidates: ArticleHit[];
  /** The lookup reads one page of hits; when it is full, more candidates may exist. */
  possiblyIncomplete?: boolean;
}

/** What a citation (code + number) designates on a date. */
export type CitationLookup =
  /** Exactly one version in force on the date. */
  | { kind: 'in_force'; hit: ArticleHit }
  /** Several versions in force on the date (several codes, or twins in one code). */
  | Ambiguous
  /** None in force on the date, but versions on record (repealed, not yet in force…). */
  | {
      kind: 'periods';
      num: string;
      /** The code asked for, else the code every period shares; `null` when they span several. */
      codeTitle: string | null;
      /** Oldest first, unknown starts last; one entry per version id. */
      periods: ArticleHit[];
      /** The all-versions page was full: more periods may exist. */
      truncated: boolean;
    }
  | NotFound;

const startKey = (h: { validFrom: IsoDate | null }) => h.validFrom ?? '9999-12-31';

/** By `validFrom` ascending, unknown starts last. */
export const byStart = (a: { validFrom: IsoDate | null }, b: { validFrom: IsoDate | null }) =>
  startKey(a).localeCompare(startKey(b));

/** First occurrence of each id, in order. */
export function dedupeById<T extends { id: string }>(items: readonly T[]): T[] {
  const byId = new Map<string, T>();
  for (const i of items) if (!byId.has(i.id)) byId.set(i.id, i);
  return [...byId.values()];
}

/** The code every hit belongs to, when they share one. */
function sharedCodeTitle(hits: readonly ArticleHit[]): string | null {
  const titles = new Set(hits.map((h) => h.codeTitle));
  return titles.size === 1 ? (hits[0]?.codeTitle ?? null) : null;
}

/**
 * Resolves `rawNumber` (as people type it) in the code `rawCode` (any code when `null`) on
 * `asOf`. An unknown code is reported as such without searching; several versions in force
 * are `ambiguous` (never one picked); none in force falls back to every version on record, so
 * a repealed article is never "not found".
 */
export async function resolveCitation(
  repo: LegislationRepository,
  rawNumber: string,
  rawCode: string | null,
  asOf: IsoDate,
  ctx: CallContext | undefined,
): Promise<CitationLookup> {
  const num = cleanArticleNumber(rawNumber);
  let codeTitle: string | null = null;
  if (rawCode !== null) {
    const resolved = await resolveCode(repo, rawCode, ctx);
    if (resolved.code === null) {
      return {
        kind: 'not_found',
        reason: 'unknown_code',
        num,
        codeTitle: rawCode,
        didYouMean: resolved.didYouMean,
      };
    }
    codeTitle = resolved.code.title;
  }

  const inForce = await repo.findArticleAt(codeTitle, num, asOf, ctx);
  const hits = dedupeById(inForce.hits);
  if (hits.length > 1) {
    return {
      kind: 'ambiguous',
      num,
      candidates: hits,
      ...(inForce.truncated && { possiblyIncomplete: true }),
    };
  }
  const [hit] = hits;
  if (hit !== undefined) return { kind: 'in_force', hit };

  const all = await repo.findArticleAllVersions(codeTitle, num, ctx);
  const periods = dedupeById(all.hits).sort(byStart);
  if (periods.length === 0) {
    return { kind: 'not_found', reason: 'no_article', num, codeTitle, didYouMean: [] };
  }
  return {
    kind: 'periods',
    num,
    codeTitle: codeTitle ?? sharedCodeTitle(periods),
    periods,
    truncated: all.truncated,
  };
}

/** The article a search listed; Légifrance not returning it is an upstream failure. */
export async function fetchListed(
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
