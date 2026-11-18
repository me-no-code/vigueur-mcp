import type { CassChamber } from '../../domain/citations.js';
import type { IsoDate } from '../../domain/dates.js';
import {
  type CaseLawCollection,
  normalizeCaseNumber,
  normalizeEcli,
} from '../../domain/decisions.js';
import { blankToNull, invalid, requireIsoDate } from '../legislation/resolve.js';
import type {
  CallContext,
  CaseLawQuery,
  CaseLawRepository,
  CaseLawSearchPage,
  LegifranceDecision,
} from './ports.js';

/** The page and page size a search uses when the call gives none. */
export const CASE_LAW_DEFAULTS = { page: 1, page_size: 10 } as const;
const MAX_PAGE_SIZE = 20;
const DECISION_ID = /^(JURI|CETA|CONS|CNIL|JUFI)TEXT\d{12}$/;

/** Shared by the services, the tools and their tests. */
export const LEGIFRANCE_CASE_LAW_COVERAGE_NOTE =
  'Note: Légifrance does not hold every Cour de cassation decision (in particular not its unreasoned rejections and non-admissions, formation restreinte RNSM/NA), receives the ones it holds weeks after Judilibre, and holds no appeal-court decisions after early 2023. Judilibre (judilibre_search_decisions) holds those decisions.';

export const CASE_LAW_COLLECTION_LABELS: Readonly<Record<CaseLawCollection, string>> = {
  judicial: 'judicial courts (JURI)',
  administrative: 'administrative courts (CETAT)',
  constitutional: 'Conseil constitutionnel (CONSTIT)',
  cnil: 'CNIL',
  financial: 'financial courts (JUFI)',
};

const HAS_PUBLICATION: readonly CaseLawCollection[] = ['judicial', 'administrative', 'financial'];

export interface SearchCaseLawInput {
  collection: CaseLawCollection;
  query?: string;
  number?: string;
  ecli?: string;
  dateFrom?: IsoDate;
  dateTo?: IsoDate;
  court?: CaseLawQuery['court'];
  chamber?: CassChamber;
  publication?: 'published' | 'unpublished';
  sort?: 'relevance' | 'newest';
  /** 1-based, default 1. */
  page?: number;
  /** 1..20, default 10. */
  pageSize?: number;
}

export interface CaseLawSearchView {
  input: SearchCaseLawInput;
  query: CaseLawQuery;
  result: CaseLawSearchPage;
  pageCount: number;
}

/** The order a search uses when the call gives none: by relevance with a criterion, else newest first. */
export function defaultCaseLawSort(input: {
  query?: string | null;
  number?: string | null;
  ecli?: string | null;
}): 'relevance' | 'newest' {
  const given = (v: string | null | undefined) => blankToNull(v ?? undefined) !== null;
  return given(input.query) || given(input.number) || given(input.ecli) ? 'relevance' : 'newest';
}

export function createSearchCaseLaw(repo: CaseLawRepository) {
  return async (input: SearchCaseLawInput, ctx?: CallContext): Promise<CaseLawSearchView> => {
    const { collection } = input;
    const text = blankToNull(input.query) ?? undefined;
    const rawNumber = blankToNull(input.number);
    const rawEcli = blankToNull(input.ecli);

    let ecli: string | undefined;
    if (rawEcli !== null) {
      if (collection !== 'judicial' && collection !== 'administrative') {
        throw invalid(
          '"ecli" works for the judicial and administrative collections. For the Conseil constitutionnel, use "number" (e.g. "2026-1217/1218").',
        );
      }
      const normalised = normalizeEcli(rawEcli);
      if (normalised === null) {
        throw invalid(`"${rawEcli}" is not an ECLI (e.g. ECLI:FR:CCASS:2025:SO01200).`);
      }
      ecli = normalised;
    }
    if ((input.court !== undefined || input.chamber !== undefined) && collection !== 'judicial') {
      throw invalid('"court" and "chamber" apply to the judicial collection only.');
    }
    if (input.chamber !== undefined && input.court !== undefined && input.court !== 'cassation') {
      throw invalid('"chamber" applies to Cour de cassation decisions (court "cassation").');
    }
    if (input.publication !== undefined && !HAS_PUBLICATION.includes(collection)) {
      throw invalid(
        `"publication" is not available for the ${CASE_LAW_COLLECTION_LABELS[collection]} collection.`,
      );
    }
    const page = input.page ?? CASE_LAW_DEFAULTS.page;
    const pageSize = input.pageSize ?? CASE_LAW_DEFAULTS.page_size;
    if (!Number.isInteger(page) || page < 1) {
      throw invalid('"page" must be a whole number, 1 or more.');
    }
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
      throw invalid(`"page_size" must be a whole number from 1 to ${MAX_PAGE_SIZE}.`);
    }
    const dateFrom =
      input.dateFrom === undefined ? undefined : requireIsoDate(input.dateFrom, '"date_from"');
    const dateTo =
      input.dateTo === undefined ? undefined : requireIsoDate(input.dateTo, '"date_to"');
    if (dateFrom !== undefined && dateTo !== undefined && dateFrom > dateTo) {
      throw invalid('"date_from" must not be after "date_to".');
    }
    const sort = input.sort ?? defaultCaseLawSort({ query: text, number: rawNumber, ecli });

    const query: CaseLawQuery = {
      collection,
      ...(text !== undefined && { text }),
      ...(rawNumber !== null && { number: normalizeCaseNumber(collection, rawNumber) }),
      ...(ecli !== undefined && { ecli }),
      ...(dateFrom && { dateFrom }),
      ...(dateTo && { dateTo }),
      ...(input.court && { court: input.court }),
      ...(input.chamber && { chamber: input.chamber }),
      ...(input.publication && { publication: input.publication }),
      sort,
      page,
      pageSize,
    };
    const result = await repo.searchCaseLaw(query, ctx);
    return { input, query, result, pageCount: Math.ceil(result.total / pageSize) };
  };
}

export type LegifranceDecisionResult =
  | { kind: 'found'; decision: LegifranceDecision }
  | { kind: 'not_found'; id: string };

export function createGetLegifranceDecision(repo: CaseLawRepository) {
  return async (input: { id: string }, ctx?: CallContext): Promise<LegifranceDecisionResult> => {
    const id = input.id.trim();
    if (!DECISION_ID.test(id)) {
      throw invalid(
        `"${input.id}" is not a Légifrance decision id (JURITEXT…, CETATEXT…, CONSTEXT…, CNILTEXT…, JUFITEXT… + 12 digits). Judilibre ids (24 hexadecimal characters) go to judilibre_get_decision.`,
      );
    }
    const decision = await repo.getDecision(id, ctx);
    return decision === null ? { kind: 'not_found', id } : { kind: 'found', decision };
  };
}
