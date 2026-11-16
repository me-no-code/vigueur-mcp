import type { IsoDate } from '../../domain/dates.js';
import type {
  CallContext,
  LegislationCollection,
  LegislationQuery,
  LegislationRepository,
  LegislationSearchPage,
} from './ports.js';
import {
  blankToNull,
  cleanArticleNumber,
  invalid,
  requireIsoDate,
  resolveCode,
  todayInParis,
} from './resolve.js';

export interface SearchLegislationInput {
  collection: LegislationCollection;
  query?: string;
  code?: string;
  articleNumber?: string;
  textNumber?: string;
  nor?: string;
  nature?: string;
  idcc?: string;
  atDate?: IsoDate;
  includeHistorical?: boolean;
  publishedFrom?: IsoDate;
  publishedTo?: IsoDate;
  page?: number;
  pageSize?: number;
}

/** The page and the page size a search uses when the call gives none. */
export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;

/** Collections searched without a date: what to do instead of giving `at_date`. */
const NO_AT_DATE: Partial<Record<LegislationCollection, string>> = {
  jorf: 'the Journal officiel is searched as published. Filter by publication date with "published_from" / "published_to".',
  kali: 'results are the collective agreements currently in force (extended or not), or every version with "include_historical".',
};

function positiveInt(value: number | undefined, label: string, fallback: number, max?: number) {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 1 || (max !== undefined && value > max)) {
    throw invalid(
      `${label} must be a whole number from 1${max === undefined ? '' : ` to ${max}`}, got ${value}.`,
    );
  }
  return value;
}

/**
 * Searches legislation. Blank optional inputs count as absent and are never forwarded. Messages
 * name the `legifrance_search_legislation` parameters. `atDate` applies to codes and loda only:
 * jorf is searched as published, kali by current status.
 */
export function createSearchLegislation(
  repo: LegislationRepository,
  opts: { today?: () => IsoDate } = {},
): (input: SearchLegislationInput, ctx?: CallContext) => Promise<LegislationSearchPage> {
  const today = opts.today ?? todayInParis;
  return async (input, ctx) => {
    const page = positiveInt(input.page, '"page"', DEFAULT_PAGE);
    const pageSize = positiveInt(input.pageSize, '"page_size"', DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const noAtDate = NO_AT_DATE[input.collection];
    if (input.atDate !== undefined && noAtDate !== undefined) {
      throw invalid(`"at_date" does not apply to the ${input.collection} collection: ${noAtDate}`);
    }
    const atDate = input.atDate === undefined ? today() : requireIsoDate(input.atDate, '"at_date"');
    const publishedFrom = blankToNull(input.publishedFrom);
    const publishedTo = blankToNull(input.publishedTo);
    if (publishedFrom !== null) requireIsoDate(publishedFrom, '"published_from"');
    if (publishedTo !== null) requireIsoDate(publishedTo, '"published_to"');
    if (publishedFrom !== null && publishedTo !== null && publishedTo < publishedFrom) {
      throw invalid(
        `"published_to" (${publishedTo}) is before "published_from" (${publishedFrom}).`,
      );
    }

    const text = blankToNull(input.query);
    const rawCode = blankToNull(input.code);
    const rawNumber = blankToNull(input.articleNumber);
    const textNumber = blankToNull(input.textNumber);
    const nor = blankToNull(input.nor);
    const nature = blankToNull(input.nature);
    const idcc = blankToNull(input.idcc);

    let codeTitle: string | null = null;
    if (rawCode !== null) {
      const resolved = await resolveCode(repo, rawCode, ctx);
      if (resolved.code === null) {
        const hint =
          resolved.didYouMean.length > 0
            ? ` Did you mean: ${resolved.didYouMean.join('; ')}?`
            : ' Use the exact title of a code, e.g. "Code civil".';
        throw invalid(`Unknown code "${rawCode}".${hint}`);
      }
      codeTitle = resolved.code.title;
    }

    const query: LegislationQuery = {
      collection: input.collection,
      ...(text !== null && { text }),
      ...(codeTitle !== null && { codeTitle }),
      ...(rawNumber !== null && { articleNumber: cleanArticleNumber(rawNumber) }),
      ...(textNumber !== null && { textNumber }),
      ...(nor !== null && { nor }),
      ...(nature !== null && { nature }),
      ...(idcc !== null && { idcc }),
      atDate,
      includeHistorical: input.includeHistorical ?? false,
      ...(publishedFrom !== null && { publishedFrom }),
      ...(publishedTo !== null && { publishedTo }),
      page,
      pageSize,
    };
    return repo.searchLegislation(query, ctx);
  };
}
