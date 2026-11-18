import { describe, expect, it } from 'vitest';
import { compose } from '../src/compose.js';
import { loadConfig } from '../src/config.js';
import { fakeFetch } from './helpers/fake-fetch.js';

const TOKEN_URL = 'https://sandbox-oauth.piste.gouv.fr/api/oauth/token';
const LEGIFRANCE_PROBE =
  'https://sandbox-api.piste.gouv.fr/dila/legifrance/lf-engine-app/list/code';
const JUDILIBRE_PROBE = 'https://sandbox-api.piste.gouv.fr/cassation/judilibre/v1.0/healthcheck';

function sandboxFetch() {
  return fakeFetch((req) => {
    switch (`${req.method} ${req.url}`) {
      case `POST ${TOKEN_URL}`:
        return Response.json({ access_token: 'tok-1', expires_in: 3600 });
      case `POST ${LEGIFRANCE_PROBE}`:
        return Response.json({});
      case `GET ${JUDILIBRE_PROBE}`:
        return Response.json({ status: 'disponible' });
      default:
        return new Response('not found', { status: 404 });
    }
  });
}

describe('compose', () => {
  it('configured: wires token provider, HTTP clients and probes per source', async () => {
    const { fetch, calls } = sandboxFetch();
    const deps = compose(
      loadConfig({
        PISTE_CLIENT_ID: 'id-123',
        PISTE_CLIENT_SECRET: 'secret-456',
        PISTE_ENV: 'sandbox',
      }),
      { fetch },
    );

    expect(deps.sources.map((s) => s.id)).toEqual(['legifrance', 'judilibre']);
    expect(await deps.getStatus()).toEqual({
      configured: true,
      env: 'sandbox',
      configProblems: [],
      sources: [
        { source: 'legifrance', state: 'ok' },
        { source: 'judilibre', state: 'ok' },
      ],
    });

    expect(calls.filter((c) => c.url === TOKEN_URL)).toHaveLength(1);
    const apiCalls = calls.filter((c) => c.url !== TOKEN_URL);
    expect(apiCalls.map((c) => `${c.method} ${c.url}`).sort()).toEqual([
      `GET ${JUDILIBRE_PROBE}`,
      `POST ${LEGIFRANCE_PROBE}`,
    ]);
    for (const call of apiCalls) {
      expect(call.headers.get('authorization')).toBe('Bearer tok-1');
    }
  });

  it.each([
    [401, 'credentials_invalid'],
    [503, 'unavailable'],
  ] as const)('a token endpoint answering %i: both checks are %s', async (status, state) => {
    const { fetch } = fakeFetch((req) =>
      req.url === TOKEN_URL ? new Response('{}', { status }) : Response.json({}),
    );
    const deps = compose(
      loadConfig({ PISTE_CLIENT_ID: 'id', PISTE_CLIENT_SECRET: 'secret', PISTE_ENV: 'sandbox' }),
      { fetch },
    );
    const report = await deps.getStatus();
    expect(report.sources.map((s) => [s.source, s.state])).toEqual([
      ['legifrance', state],
      ['judilibre', state],
    ]);
  });

  it('unconfigured: no probes, no network, no sources', async () => {
    const { fetch, calls } = sandboxFetch();
    const config = loadConfig({});
    const deps = compose(config, { fetch });

    expect(deps.config).toBe(config);
    expect(deps.sources).toEqual([]);
    expect(await deps.getStatus()).toEqual({
      configured: false,
      env: null,
      configProblems: [],
      sources: [],
    });
    expect(calls).toHaveLength(0);
  });
});
