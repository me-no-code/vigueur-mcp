import type {
  createGetJudilibreDecision,
  createListJudilibreTaxonomy,
  createSearchJudilibre,
} from '../../services/case-law/judilibre.js';
import type { SourceModule } from '../../sources.js';
import { type ToolContext, toolContext } from '../envelope.js';
import { registerGetDecisionTool } from './get-decision.js';
import { registerListTaxonomyTool } from './list-taxonomy.js';
import { registerSearchDecisionsTool } from './search-decisions.js';

/** The Judilibre services the tools call (see `services/case-law/judilibre.ts`). */
export interface JudilibreServices {
  searchDecisions: ReturnType<typeof createSearchJudilibre>;
  getDecision: ReturnType<typeof createGetJudilibreDecision>;
  listTaxonomy: ReturnType<typeof createListJudilibreTaxonomy>;
}

/** The Judilibre tools, with their clock and deadline from `toolContext(opts)`. */
export function createJudilibreSource(
  services: JudilibreServices,
  opts: Partial<ToolContext> = {},
): SourceModule {
  const ctx = toolContext(opts);
  return {
    id: 'judilibre',
    register(server) {
      registerSearchDecisionsTool(server, services.searchDecisions, ctx);
      registerGetDecisionTool(server, services.getDecision, ctx);
      registerListTaxonomyTool(server, services.listTaxonomy, ctx);
    },
  };
}
