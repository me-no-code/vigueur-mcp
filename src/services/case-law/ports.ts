import type { CassChamber } from '../../domain/citations.js';
import type { IsoDate } from '../../domain/dates.js';
import type { CaseLawCollection } from '../../domain/decisions.js';
import type { CallContext } from '../legislation/ports.js';

export type { CallContext } from '../legislation/ports.js';

export type JudilibreJurisdiction = 'cc' | 'ca' | 'tj' | 'tcom' | 'cph';

/** A source key with its label; `label === key` when no label is known. */
export interface Labelled {
  key: string;
  label: string;
}

export interface JudilibreQuery {
  query: string;
  operator: 'and' | 'or' | 'exact';
  jurisdiction: JudilibreJurisdiction;
  chamber?: CassChamber;
  formation?: 'fp' | 'fm' | 'fs' | 'f' | 'frh' | 'frr';
  publication?: 'b' | 'r' | 'l' | 'c';
  solution?: string;
  location?: string;
  field?:
    | 'text'
    | 'introduction'
    | 'expose'
    | 'moyens'
    | 'motivations'
    | 'dispositif'
    | 'visa'
    | 'summary'
    | 'themes';
  dateFrom?: IsoDate;
  dateTo?: IsoDate;
  sort: 'relevance' | 'newest' | 'oldest';
  /** 0-based. */
  page: number;
  /** 1..50. */
  pageSize: number;
}

export interface JudilibreHit {
  id: string;
  jurisdiction: Labelled;
  chamber: Labelled | null;
  numbers: string[];
  ecli: string | null;
  formation: Labelled | null;
  publication: Labelled[];
  decisionDate: IsoDate | null;
  solution: Labelled | null;
  /** ca/tj free-text outcome (`solution_alt`, or a free-text `solution`). */
  solutionText: string | null;
  location: Labelled | null;
  summary: string | null;
  highlights: string[];
}

export interface JudilibreSearchPage {
  total: number;
  page: number;
  pageSize: number;
  relaxed: boolean;
  hits: JudilibreHit[];
}

export type DecisionZone =
  | 'introduction'
  | 'expose'
  | 'moyens'
  | 'motivations'
  | 'dispositif'
  | 'annexes';

/** A zone of the decision text; UTF-16 offsets into `text` (usable with `String.prototype.slice`). */
export interface ZoneSegment {
  zone: DecisionZone;
  start: number;
  end: number;
}

export interface JudilibreDecision extends Omit<JudilibreHit, 'highlights'> {
  text: string;
  /** Sorted by start; empty when the source gives none. */
  zones: ZoneSegment[];
  /** The outcome in this decision's own timeline entry, when present. */
  solutionFull: string | null;
  updatedOn: IsoDate | null;
  /** `titlesAndSummaries[].titles`, flattened. */
  titles: string[];
  /** Each visa title as plain text (links dropped). */
  visa: string[];
  rapprochements: string[];
  /** The attacked decision. */
  contested: {
    title: string;
    number: string | null;
    date: IsoDate | null;
    judilibreId: string | null;
  } | null;
  /** `url` is the file's `rawUrl`, else its `url`. */
  files: Array<{ name: string; type: string; url: string }>;
}

export type JudilibreTaxonomyId =
  | 'jurisdiction'
  | 'chamber'
  | 'formation'
  | 'publication'
  | 'solution'
  | 'location'
  | 'theme'
  | 'field';

export interface TaxonomyEntry {
  key: string | null;
  label: string;
  group: string | null;
}

export interface JudilibreRepository {
  search(q: JudilibreQuery, ctx?: CallContext): Promise<JudilibreSearchPage>;
  /** `null` when the id is unknown (HTTP 404). */
  getDecision(id: string, ctx?: CallContext): Promise<JudilibreDecision | null>;
  taxonomy(
    id: JudilibreTaxonomyId,
    context: JudilibreJurisdiction,
    ctx?: CallContext,
  ): Promise<TaxonomyEntry[]>;
}

// ---------------------------------------------------------------------------------------------
// Légifrance case law (JURI, CETAT, CONSTIT, CNIL, JUFI)

export interface CaseLawQuery {
  collection: CaseLawCollection;
  text?: string;
  /** Normalised (`normalizeCaseNumber`). */
  number?: string;
  /** Normalised (`normalizeEcli`). */
  ecli?: string;
  dateFrom?: IsoDate;
  dateTo?: IsoDate;
  /** Judicial only. */
  court?: 'cassation' | 'appeal' | 'first_instance';
  /** Judicial only. */
  chamber?: CassChamber;
  /** Judicial, administrative and financial. */
  publication?: 'published' | 'unpublished';
  sort: 'relevance' | 'newest' | 'oldest';
  /** 1-based. */
  page: number;
  /** 1..100. */
  pageSize: number;
}

export interface CaseLawHit {
  id: string;
  collection: CaseLawCollection;
  title: string;
  court: string | null;
  chamber: string | null;
  nature: string | null;
  decisionDate: IsoDate | null;
  numbers: string[];
  publication: string | null;
  solution: string | null;
  snippet: string | null;
}

export interface CaseLawSearchPage {
  total: number;
  page: number;
  pageSize: number;
  hits: CaseLawHit[];
}

export interface CaseLawRepository {
  searchCaseLaw(q: CaseLawQuery, ctx?: CallContext): Promise<CaseLawSearchPage>;
}
