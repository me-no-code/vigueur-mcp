import type { CassChamber } from '../../domain/citations.js';
import type { IsoDate } from '../../domain/dates.js';
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

export interface JudilibreRepository {
  search(q: JudilibreQuery, ctx?: CallContext): Promise<JudilibreSearchPage>;
  // getDecision and taxonomy
}
