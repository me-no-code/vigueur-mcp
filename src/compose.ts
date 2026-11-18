import { createJudilibreClient } from './clients/judilibre/client.js';
import { createLegifranceCaseLawClient } from './clients/legifrance/case-law.js';
import { createLegifranceClient } from './clients/legifrance/client.js';
import { createTokenProvider } from './clients/piste/auth.js';
import { pisteEndpoints } from './clients/piste/endpoints.js';
import { createPisteHttp } from './clients/piste/http.js';
import { probeJudilibre, probeLegifrance } from './clients/piste/probes.js';
import type { Config } from './config.js';
import type { IsoDate } from './domain/dates.js';
import type { ServerDeps } from './server.js';
import {
  createGetJudilibreDecision,
  createListJudilibreTaxonomy,
  createSearchJudilibre,
} from './services/case-law/judilibre.js';
import {
  createGetLegifranceDecision,
  createSearchCaseLaw,
} from './services/case-law/legifrance.js';
import { createBrowseCode } from './services/legislation/browse.js';
import { createListChanges } from './services/legislation/changes.js';
import { createGetArticle } from './services/legislation/get-article.js';
import { createGetText } from './services/legislation/get-text.js';
import { createGetArticleHistory } from './services/legislation/history.js';
import { createLatestJo, createListReferenceValues } from './services/legislation/jo.js';
import { createSearchLegislation } from './services/legislation/search.js';
import { getStatus, type StatusContext } from './services/status.js';
import type { FetchLike } from './shared/fetch.js';
import { toolContext } from './tools/envelope.js';
import { createJudilibreSource } from './tools/judilibre/index.js';
import { createLegifranceSource } from './tools/legifrance/index.js';

/**
 * Wires the PISTE clients and services for a configuration (no network until used). `now` and
 * `today` (default: the system clock, today in Paris) are the clock and date of every client,
 * service and tool.
 */
export function compose(
  config: Config,
  opts: { fetch?: FetchLike; today?: () => IsoDate; now?: () => Date } = {},
): ServerDeps {
  const tools = toolContext({ today: opts.today, now: opts.now });
  const { today, now } = tools;
  const { piste } = config;
  if (piste === null) {
    return {
      config,
      getStatus: (ctx) => getStatus({ config, probes: {} }, ctx),
      sources: [],
      tools,
    };
  }

  const endpoints = pisteEndpoints(piste.env);
  const tokens = createTokenProvider({
    tokenUrl: endpoints.oauthTokenUrl,
    clientId: piste.clientId,
    clientSecret: piste.clientSecret,
    fetch: opts.fetch,
  });
  const legifrance = createPisteHttp({
    baseUrl: endpoints.legifranceBaseUrl,
    source: 'legifrance',
    tokens,
    fetch: opts.fetch,
  });
  const judilibre = createPisteHttp({
    baseUrl: endpoints.judilibreBaseUrl,
    source: 'judilibre',
    tokens,
    fetch: opts.fetch,
  });
  const probes = {
    legifrance: (ctx?: StatusContext) => probeLegifrance(legifrance, ctx),
    judilibre: (ctx?: StatusContext) => probeJudilibre(judilibre, ctx),
  };

  const legislation = createLegifranceClient(legifrance, { now });
  const caseLaw = createLegifranceCaseLawClient(legifrance);
  const legifranceSource = createLegifranceSource(
    {
      getArticle: createGetArticle(legislation, { today }),
      getArticleHistory: createGetArticleHistory(legislation, { today }),
      searchLegislation: createSearchLegislation(legislation, { today }),
      listChanges: createListChanges(legislation, { today }),
      getText: createGetText(legislation, { today }),
      browseCode: createBrowseCode(legislation, { today }),
      latestJo: createLatestJo(legislation),
      listReferenceValues: createListReferenceValues(legislation, { today }),
      searchCaseLaw: createSearchCaseLaw(caseLaw),
      getDecision: createGetLegifranceDecision(caseLaw),
    },
    tools,
  );

  const judilibreRepo = createJudilibreClient(judilibre, now);
  const judilibreSource = createJudilibreSource(
    {
      searchDecisions: createSearchJudilibre(judilibreRepo),
      getDecision: createGetJudilibreDecision(judilibreRepo),
      listTaxonomy: createListJudilibreTaxonomy(judilibreRepo),
    },
    tools,
  );

  return {
    config,
    getStatus: (ctx) => getStatus({ config, probes }, ctx),
    sources: [legifranceSource, judilibreSource],
    tools,
  };
}
