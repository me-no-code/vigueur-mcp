import type {
  CallContext,
  CaseLawHit,
  CaseLawQuery,
  CaseLawRepository,
  CaseLawSearchPage,
  JudilibreDecision,
  JudilibreHit,
  JudilibreJurisdiction,
  JudilibreQuery,
  JudilibreRepository,
  JudilibreSearchPage,
  JudilibreTaxonomyId,
  LegifranceDecision,
  TaxonomyEntry,
} from '../../src/services/case-law/ports.js';

export interface FakeJudilibreOptions {
  total?: number;
  hits?: JudilibreHit[];
  decisions?: Record<string, JudilibreDecision>;
  taxonomies?: Partial<Record<JudilibreTaxonomyId, TaxonomyEntry[]>>;
  /** When the taxonomy lists were fetched (default 2026-11-16T08:00:00Z). */
  fetchedAt?: Date;
}

export interface FakeJudilibre {
  repo: JudilibreRepository;
  calls: {
    search: Array<{ query: JudilibreQuery; ctx?: CallContext }>;
    getDecision: string[];
    taxonomy: Array<{ id: JudilibreTaxonomyId; context: JudilibreJurisdiction }>;
  };
}

/** An in-memory `JudilibreRepository` that records every call. */
export function fakeJudilibre(opts: FakeJudilibreOptions = {}): FakeJudilibre {
  const calls: FakeJudilibre['calls'] = { search: [], getDecision: [], taxonomy: [] };
  const repo: JudilibreRepository = {
    async search(query, ctx): Promise<JudilibreSearchPage> {
      calls.search.push({ query, ctx });
      return {
        total: opts.total ?? opts.hits?.length ?? 0,
        page: query.page,
        pageSize: query.pageSize,
        relaxed: false,
        hits: opts.hits ?? [],
      };
    },
    async getDecision(id) {
      calls.getDecision.push(id);
      return opts.decisions?.[id] ?? null;
    },
    async taxonomy(id, context) {
      calls.taxonomy.push({ id, context });
      return {
        entries: opts.taxonomies?.[id] ?? [],
        fetchedAt: opts.fetchedAt ?? new Date('2026-11-16T08:00:00Z'),
      };
    },
  };
  return { repo, calls };
}

export function decisionOf(over: Partial<JudilibreDecision> = {}): JudilibreDecision {
  return {
    id: '6a0e9ff1cdc6046d47668703',
    jurisdiction: { key: 'cc', label: 'Cour de cassation' },
    chamber: null,
    numbers: ['23-20.348'],
    ecli: null,
    formation: null,
    publication: [],
    decisionDate: '2026-05-21',
    solution: null,
    solutionText: null,
    location: null,
    summary: null,
    text: '',
    zones: [],
    solutionFull: null,
    updatedOn: null,
    titles: [],
    visa: [],
    rapprochements: [],
    contested: null,
    files: [],
    ...over,
  };
}

export interface FakeLegifranceOptions {
  total?: number;
  hits?: CaseLawHit[];
  decisions?: Record<string, LegifranceDecision>;
}

export interface FakeLegifrance {
  repo: CaseLawRepository;
  calls: {
    search: Array<{ query: CaseLawQuery; ctx?: CallContext }>;
    getDecision: string[];
  };
}

/** An in-memory `CaseLawRepository` that records every call. */
export function fakeLegifrance(opts: FakeLegifranceOptions = {}): FakeLegifrance {
  const calls: FakeLegifrance['calls'] = { search: [], getDecision: [] };
  const repo: CaseLawRepository = {
    async searchCaseLaw(query, ctx): Promise<CaseLawSearchPage> {
      calls.search.push({ query, ctx });
      return {
        total: opts.total ?? opts.hits?.length ?? 0,
        page: query.page,
        pageSize: query.pageSize,
        hits: opts.hits ?? [],
      };
    },
    async getDecision(id) {
      calls.getDecision.push(id);
      return opts.decisions?.[id] ?? null;
    },
  };
  return { repo, calls };
}
