import type { IsoDate } from '../../domain/dates.js';
import type { ChangesView } from '../../services/legislation/changes.js';
import type {
  ArticleHistoryResult,
  GetArticleHistoryInput,
} from '../../services/legislation/history.js';
import type { CallContext, LegislationSearchPage } from '../../services/legislation/ports.js';
import { todayInParis } from '../../services/legislation/resolve.js';
import type { SearchLegislationInput } from '../../services/legislation/search.js';
import type { SourceModule } from '../../sources.js';
import { type GetArticle, registerGetArticleTool } from './get-article.js';

/** The Légifrance services the tools call (see `services/legislation/`). */
export interface LegifranceServices {
  getArticle: GetArticle;
  getArticleHistory: (
    input: GetArticleHistoryInput,
    ctx?: CallContext,
  ) => Promise<ArticleHistoryResult>;
  searchLegislation: (
    input: SearchLegislationInput,
    ctx?: CallContext,
  ) => Promise<LegislationSearchPage>;
  listChanges: (
    input: { code: string; since: IsoDate; until?: IsoDate },
    ctx?: CallContext,
  ) => Promise<ChangesView>;
}

/** The Légifrance tools; `today` (default: today in Paris) sets the tense of upcoming changes. */
export function createLegifranceSource(
  services: LegifranceServices,
  opts: { today?: () => IsoDate } = {},
): SourceModule {
  const today = opts.today ?? todayInParis;
  return {
    id: 'legifrance',
    register(server) {
      registerGetArticleTool(server, services.getArticle, today);
    },
  };
}
