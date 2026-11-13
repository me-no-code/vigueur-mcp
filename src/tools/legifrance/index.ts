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
import { type BrowseCode, registerBrowseCodeTool } from './browse-code.js';
import { type GetArticle, registerGetArticleTool } from './get-article.js';
import { registerGetArticleHistoryTool } from './get-article-history.js';
import { type GetText, registerGetTextTool } from './get-text.js';
import { registerListChangesTool } from './list-changes.js';
import { registerSearchLegislationTool } from './search-legislation.js';

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
  getText: GetText;
  browseCode: BrowseCode;
}

/** The Légifrance tools; `today` (default: today in Paris) sets the tense of upcoming changes; `deadlineMs`
 * (default 45 000) bounds each call. */
export function createLegifranceSource(
  services: LegifranceServices,
  opts: { today?: () => IsoDate; deadlineMs?: number } = {},
): SourceModule {
  const today = opts.today ?? todayInParis;
  return {
    id: 'legifrance',
    register(server) {
      registerGetArticleTool(server, services.getArticle, today, opts.deadlineMs);
      registerGetArticleHistoryTool(server, services.getArticleHistory, today, opts.deadlineMs);
      registerSearchLegislationTool(server, services.searchLegislation, today, opts.deadlineMs);
      registerListChangesTool(server, services.listChanges, today, opts.deadlineMs);
      registerGetTextTool(server, services.getText, opts.deadlineMs);
      registerBrowseCodeTool(server, services.browseCode, opts.deadlineMs);
    },
  };
}
