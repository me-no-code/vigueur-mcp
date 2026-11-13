import type { CassChamber } from '../../domain/citations.js';
import type { IsoDate } from '../../domain/dates.js';
import { PUBLICATION_WIRE } from '../../domain/judilibre-labels.js';
import { foldKey } from '../../domain/text.js';
import { blankToNull, invalid, requireIsoDate } from '../legislation/resolve.js';
import type {
  CallContext,
  DecisionZone,
  JudilibreDecision,
  JudilibreJurisdiction,
  JudilibreQuery,
  JudilibreRepository,
  JudilibreSearchPage,
  JudilibreTaxonomyId,
  TaxonomyEntry,
} from './ports.js';

const MAX_QUERY_LENGTH = 512;
/** The API answers 416 beyond its first 10 000 results. */
const MAX_WINDOW = 10_000;
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 20;
const DECISION_ID = /^[0-9a-f]{24}$/;
const ZONE_JOINER = '\n[…]\n';

export type JudilibreMatch = 'all_words' | 'any_word' | 'exact_phrase';

const OPERATOR: Record<JudilibreMatch, JudilibreQuery['operator']> = {
  all_words: 'and',
  any_word: 'or',
  exact_phrase: 'exact',
};

export interface SearchJudilibreInput {
  query: string;
  match?: JudilibreMatch;
  jurisdiction?: JudilibreJurisdiction;
  chamber?: CassChamber;
  formation?: JudilibreQuery['formation'];
  publication?: keyof typeof PUBLICATION_WIRE;
  solution?: string;
  location?: string;
  searchIn?: JudilibreQuery['field'];
  dateFrom?: IsoDate;
  dateTo?: IsoDate;
  sort?: 'relevance' | 'newest' | 'oldest';
  /** 1-based, default 1. */
  page?: number;
  /** 1..20, default 10. */
  pageSize?: number;
}

export interface JudilibreSearchView {
  input: Required<
    Pick<SearchJudilibreInput, 'query' | 'match' | 'jurisdiction' | 'sort' | 'page' | 'pageSize'>
  > &
    SearchJudilibreInput;
  /** `result.page` is 1-based. */
  result: JudilibreSearchPage;
  pageCount: number;
}

export function createSearchJudilibre(repo: JudilibreRepository) {
  return async (input: SearchJudilibreInput, ctx?: CallContext): Promise<JudilibreSearchView> => {
    const query = blankToNull(input.query);
    if (query === null) {
      throw invalid(
        '"query" is required: Judilibre finds nothing without search words. To look up a decision, use its pourvoi number or ECLI as the query.',
      );
    }
    if (query.length > MAX_QUERY_LENGTH) {
      throw invalid(`"query" is limited to ${MAX_QUERY_LENGTH} characters.`);
    }
    const jurisdiction = input.jurisdiction ?? 'cc';
    const solution = blankToNull(input.solution) ?? undefined;
    const location = blankToNull(input.location) ?? undefined;
    if (
      jurisdiction !== 'cc' &&
      (input.chamber || input.formation || input.publication || solution)
    ) {
      throw invalid(
        '"chamber", "formation", "publication" and "solution" filter Cour de cassation decisions only (jurisdiction "cc"). For other courts, put the chamber or outcome words in "query".',
      );
    }
    if (jurisdiction === 'cc' && location) {
      throw invalid(
        '"location" applies to courts of appeal and first-instance courts (jurisdiction ca, tj, tcom or cph).',
      );
    }
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? DEFAULT_PAGE_SIZE;
    if (!Number.isInteger(page) || page < 1) {
      throw invalid('"page" must be a whole number, 1 or more.');
    }
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
      throw invalid(`"page_size" must be a whole number from 1 to ${MAX_PAGE_SIZE}.`);
    }
    if (page * pageSize > MAX_WINDOW) {
      throw invalid(
        'Judilibre returns at most the first 10 000 results; narrow the search (dates, chamber, more precise words).',
      );
    }
    const dateFrom =
      input.dateFrom === undefined ? undefined : requireIsoDate(input.dateFrom, '"date_from"');
    const dateTo =
      input.dateTo === undefined ? undefined : requireIsoDate(input.dateTo, '"date_to"');
    if (dateFrom !== undefined && dateTo !== undefined && dateFrom > dateTo) {
      throw invalid('"date_from" must not be after "date_to".');
    }
    const match = input.match ?? 'all_words';
    const sort = input.sort ?? 'relevance';

    const wire: JudilibreQuery = {
      query,
      operator: OPERATOR[match],
      jurisdiction,
      ...(input.chamber && { chamber: input.chamber }),
      ...(input.formation && { formation: input.formation }),
      ...(input.publication && { publication: PUBLICATION_WIRE[input.publication] }),
      ...(solution && { solution }),
      ...(location && { location }),
      ...(input.searchIn && { field: input.searchIn }),
      ...(dateFrom && { dateFrom }),
      ...(dateTo && { dateTo }),
      sort,
      page: page - 1,
      pageSize,
    };
    const result = await repo.search(wire, ctx);
    return {
      input: { ...input, query, match, jurisdiction, sort, page, pageSize },
      result: { ...result, page },
      pageCount: Math.ceil(Math.min(result.total, MAX_WINDOW) / pageSize),
    };
  };
}

export type JudilibreDecisionResult =
  | {
      kind: 'found';
      decision: JudilibreDecision;
      zone: { name: DecisionZone; text: string } | null;
      zoneMissing: DecisionZone | null;
    }
  | { kind: 'not_found'; id: string };

export function createGetJudilibreDecision(repo: JudilibreRepository) {
  return async (
    input: { id: string; zone?: DecisionZone },
    ctx?: CallContext,
  ): Promise<JudilibreDecisionResult> => {
    const id = input.id.trim();
    if (!DECISION_ID.test(id)) {
      throw invalid(
        `"${input.id}" is not a Judilibre decision id (24 hexadecimal characters). Légifrance ids (JURITEXT…, CETATEXT…) go to legifrance_get_decision.`,
      );
    }
    const decision = await repo.getDecision(id, ctx);
    if (decision === null) return { kind: 'not_found', id };
    if (input.zone === undefined) {
      return { kind: 'found', decision, zone: null, zoneMissing: null };
    }
    const segments = decision.zones.filter((z) => z.zone === input.zone);
    if (segments.length === 0) {
      return { kind: 'found', decision, zone: null, zoneMissing: input.zone };
    }
    const text = segments.map((s) => decision.text.slice(s.start, s.end)).join(ZONE_JOINER);
    return { kind: 'found', decision, zone: { name: input.zone, text }, zoneMissing: null };
  };
}

export type TaxonomyResult =
  | {
      kind: 'list';
      list: JudilibreTaxonomyId;
      jurisdiction: JudilibreJurisdiction;
      entries: TaxonomyEntry[];
      total: number;
      contains: string | null;
    }
  | { kind: 'free_text'; list: JudilibreTaxonomyId; jurisdiction: JudilibreJurisdiction };

const CC_ONLY_LISTS: readonly JudilibreTaxonomyId[] = [
  'chamber',
  'formation',
  'publication',
  'solution',
];

export function createListJudilibreTaxonomy(repo: JudilibreRepository) {
  return async (
    input: { list: JudilibreTaxonomyId; jurisdiction?: JudilibreJurisdiction; contains?: string },
    ctx?: CallContext,
  ): Promise<TaxonomyResult> => {
    const jurisdiction = input.jurisdiction ?? 'cc';
    if (jurisdiction !== 'cc' && CC_ONLY_LISTS.includes(input.list)) {
      return { kind: 'free_text', list: input.list, jurisdiction };
    }
    const all = await repo.taxonomy(input.list, jurisdiction, ctx);
    const contains = blankToNull(input.contains);
    const needle = contains === null ? '' : foldKey(contains);
    const entries =
      needle === ''
        ? all
        : all.filter(
            (e) => foldKey(e.label).includes(needle) || foldKey(e.group ?? '').includes(needle),
          );
    return { kind: 'list', list: input.list, jurisdiction, entries, total: all.length, contains };
  };
}
