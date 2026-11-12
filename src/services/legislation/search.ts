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

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;

function positiveInt(value: number | undefined, label: string, fallback: number, max?: number) {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 1 || (max !== undefined && value > max)) {
    throw invalid(
      `${label} must be a whole number from 1${max === undefined ? '' : ` to ${max}`}, got ${value}.`,
    );
  }
  return value;
}

/** Searches legislation. Blank optional inputs count as absent and are never forwarded. */
export function createSearchLegislation(
  repo: LegislationRepository,
  opts: { today?: () => IsoDate } = {},
): (input: SearchLegislationInput, ctx?: CallContext) => Promise<LegislationSearchPage> {
  const today = opts.today ?? todayInParis;
  return async (input, ctx) => {
    const page = positiveInt(input.page, 'page', 1);
    const pageSize = positiveInt(input.pageSize, 'pageSize', DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const atDate = input.atDate === undefined ? today() : requireIsoDate(input.atDate, 'atDate');
    const publishedFrom = blankToNull(input.publishedFrom);
    const publishedTo = blankToNull(input.publishedTo);
    if (publishedFrom !== null) requireIsoDate(publishedFrom, 'publishedFrom');
    if (publishedTo !== null) requireIsoDate(publishedTo, 'publishedTo');

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
