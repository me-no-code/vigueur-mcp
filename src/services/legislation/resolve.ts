import { normalizeArticleNumber } from '../../domain/articles.js';
import { resolveCodeName } from '../../domain/codes.js';
import { type IsoDate, isIsoDate, isoDateInParis } from '../../domain/dates.js';
import { foldKey } from '../../domain/text.js';
import { VigueurError } from '../../shared/errors.js';
import type { CallContext, CodeInfo, LegislationRepository } from './ports.js';

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
