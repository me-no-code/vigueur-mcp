import { describe, expect, it } from 'vitest';
import type { RequestOptions } from '../../../src/clients/piste/http.js';
import { createPisteHttp } from '../../../src/clients/piste/http.js';
import { VigueurError } from '../../../src/shared/errors.js';
import { fakeFetch } from '../../helpers/fake-fetch.js';

function setup(handler: (req: Request) => Response | Promise<Response>) {
  const f = fakeFetch(handler);
  const sleeps: number[] = [];
  let invalidations = 0;
  const http = createPisteHttp({
    baseUrl: 'https://x.test/base',
    source: 'legifrance',
    tokens: {
      getToken: async () => 'tok-1',
      invalidate: () => {
        invalidations++;
      },
    },
    fetch: f.fetch,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });
  return { http, calls: f.calls, sleeps, invalidations: () => invalidations };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });

async function failure(p: Promise<unknown>): Promise<VigueurError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(VigueurError);
    return e as VigueurError;
  }
  throw new Error('expected rejection');
}

describe('createPisteHttp', () => {
  it('sends bearer token and JSON body', async () => {
    const { http, calls } = setup(async (req) => json(await req.json()));
    const out = await http.request({ method: 'POST', path: '/list/code', body: { pageNumber: 1 } });
    expect(out).toEqual({ pageNumber: 1 });
    const req = calls[0] as Request;
    expect(req.url).toBe('https://x.test/base/list/code');
    expect(req.redirect).toBe('error');
    expect(req.headers.get('authorization')).toBe('Bearer tok-1');
    expect(req.headers.get('content-type')).toBe('application/json');
    expect(req.headers.get('accept')).toBe('application/json');
  });

  it('encodes query and skips undefined', async () => {
    const { http, calls } = setup(() => json({}));
    await http.request({
      method: 'GET',
      path: '/search',
      query: { query: 'forfait jours', page_size: 1, x: undefined },
    });
    expect((calls[0] as Request).url).toMatch(/\/search\?query=forfait\+jours&page_size=1$/);
  });

  it('refreshes the token once on 401', async () => {
    let n = 0;
    const { http, invalidations } = setup(() => (n++ === 0 ? json({}, 401) : json({ ok: true })));
    await expect(http.request({ method: 'GET', path: '/a' })).resolves.toEqual({ ok: true });
    expect(invalidations()).toBe(1);
  });

  it('reports credentials_invalid on a second 401', async () => {
    const { http } = setup(() => json({}, 401));
    const err = await failure(http.request({ method: 'GET', path: '/a' }));
    expect(err.kind).toBe('credentials_invalid');
    expect(err.details?.source).toBe('legifrance');
  });

  it('honours Retry-After on 429 then reports quota_exceeded', async () => {
    const { http, sleeps, calls } = setup(() => json({}, 429, { 'Retry-After': '2' }));
    const err = await failure(http.request({ method: 'GET', path: '/a' }));
    expect(err.kind).toBe('quota_exceeded');
    expect(err.details?.retryAfterSeconds).toBe(2);
    expect(sleeps).toEqual([2000, 2000]);
    expect(calls).toHaveLength(3);
  });

  it('caps Retry-After waits at 10 s', async () => {
    const { http, sleeps } = setup(() => json({}, 429, { 'Retry-After': '120' }));
    const err = await failure(http.request({ method: 'GET', path: '/a' }));
    expect(sleeps).toEqual([10000, 10000]);
    expect(err.details?.retryAfterSeconds).toBe(120);
  });

  it('ignores a non-integer Retry-After', async () => {
    const { http, sleeps } = setup(() =>
      json({}, 429, { 'Retry-After': 'Wed, 21 Oct 2026 07:28:00 GMT' }),
    );
    const err = await failure(http.request({ method: 'GET', path: '/a' }));
    expect(sleeps).toEqual([500, 1000]);
    expect(err.details?.retryAfterSeconds).toBeUndefined();
  });

  it('retries 5xx with backoff then upstream_unavailable', async () => {
    const { http, sleeps } = setup(() => json({}, 503));
    const err = await failure(http.request({ method: 'GET', path: '/a' }));
    expect(err.kind).toBe('upstream_unavailable');
    expect(err.details?.status).toBe(503);
    expect(sleeps).toEqual([500, 1000]);
  });

  it('maps 403 to forbidden', async () => {
    const { http } = setup(() => new Response('', { status: 403 }));
    const err = await failure(http.request({ method: 'GET', path: '/a' }));
    expect(err.kind).toBe('forbidden');
    expect(err.details?.status).toBe(403);
  });

  it('maps 404 to not_found', async () => {
    const { http } = setup(() => json({}, 404));
    const err = await failure(http.request({ method: 'GET', path: '/a' }));
    expect(err.kind).toBe('not_found');
  });

  it('maps 400 to invalid_input with a bounded excerpt', async () => {
    const { http } = setup(() => new Response('x'.repeat(1000), { status: 400 }));
    const err = await failure(http.request({ method: 'GET', path: '/a' }));
    expect(err.kind).toBe('invalid_input');
    expect(err.message).toContain('HTTP 400');
    expect(err.message.length).toBeLessThan(400);
  });

  it('HTML on 200 is upstream_unavailable', async () => {
    const { http } = setup(() => new Response('<html>Maintenance</html>', { status: 200 }));
    const err = await failure(http.request({ method: 'GET', path: '/a' }));
    expect(err.kind).toBe('upstream_unavailable');
    expect(err.message).toContain('unexpected response');
  });

  it('network failure is retried then upstream_unavailable', async () => {
    const { http, calls } = setup(() => {
      throw new TypeError('fetch failed');
    });
    const err = await failure(http.request({ method: 'GET', path: '/a' }));
    expect(err.kind).toBe('upstream_unavailable');
    expect(err.details?.source).toBe('legifrance');
    expect(calls).toHaveLength(3);
  });

  it('a hung request times out', async () => {
    const { http } = setup(
      (req) =>
        new Promise<Response>((_, reject) => {
          req.signal.addEventListener('abort', () => reject(req.signal.reason));
        }),
    );
    const opts: RequestOptions = { maxRetries: 0, timeoutMs: 20 };
    const err = await failure(http.request({ method: 'GET', path: '/a' }, opts));
    expect(err.kind).toBe('upstream_unavailable');
    expect(err.message).toContain('timed out');
  });

  it('per-request maxRetries overrides the default', async () => {
    const { http, calls } = setup(() => json({}, 503));
    await failure(http.request({ method: 'GET', path: '/a' }, { maxRetries: 0 }));
    expect(calls).toHaveLength(1);
  });
});
