import { createTokenProvider } from './clients/piste/auth.js';
import { pisteEndpoints } from './clients/piste/endpoints.js';
import { createPisteHttp } from './clients/piste/http.js';
import { probeJudilibre, probeLegifrance } from './clients/piste/probes.js';
import type { Config } from './config.js';
import type { ServerDeps } from './server.js';
import { getStatus } from './services/status.js';
import type { FetchLike } from './shared/fetch.js';

/** Wires the PISTE clients and services for a configuration (no network until used). */
export function compose(config: Config, opts: { fetch?: FetchLike } = {}): ServerDeps {
  const { piste } = config;
  if (piste === null) {
    return { config, getStatus: () => getStatus({ config, probes: {} }), sources: [] };
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
    legifrance: () => probeLegifrance(legifrance),
    judilibre: () => probeJudilibre(judilibre),
  };

  return { config, getStatus: () => getStatus({ config, probes }), sources: [] };
}
