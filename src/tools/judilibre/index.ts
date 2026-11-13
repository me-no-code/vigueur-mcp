import type {
  createGetJudilibreDecision,
  createListJudilibreTaxonomy,
  createSearchJudilibre,
} from '../../services/case-law/judilibre.js';
import type { SourceModule } from '../../sources.js';
import { registerGetDecisionTool } from './get-decision.js';
import { registerListTaxonomyTool } from './list-taxonomy.js';
import { registerSearchDecisionsTool } from './search-decisions.js';

/** The Judilibre services the tools call (see `services/case-law/judilibre.ts`). */
export interface JudilibreServices {
  searchDecisions: ReturnType<typeof createSearchJudilibre>;
  getDecision: ReturnType<typeof createGetJudilibreDecision>;
  listTaxonomy: ReturnType<typeof createListJudilibreTaxonomy>;
}

/** The Judilibre tools; `deadlineMs` (default 45 000) bounds each call. */
export function createJudilibreSource(
  services: JudilibreServices,
  opts: { deadlineMs?: number } = {},
): SourceModule {
  return {
    id: 'judilibre',
    register(server) {
      registerSearchDecisionsTool(server, services.searchDecisions, opts.deadlineMs);
      registerGetDecisionTool(server, services.getDecision, opts.deadlineMs);
      registerListTaxonomyTool(server, services.listTaxonomy, opts.deadlineMs);
    },
  };
}
