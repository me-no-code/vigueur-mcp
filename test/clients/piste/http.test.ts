import { describe, expect, it, vi } from 'vitest';
import type { RequestOptions } from '../../../src/clients/piste/http.js';
import {
  createPisteHttp,
  DEFAULT_MAX_RETRIES,
  DEFAULT_TIMEOUT_MS,
} from '../../../src/clients/piste/http.js';
import { VigueurError } from '../../../src/shared/errors.js';
import { fakeFetch } from '../../helpers/fake-fetch.js';
import { loadFixture } from '../../helpers/fake-piste-http.js';

function setup(
  handler: (req: Request) => Response | Promise<Response>,
  config: { maxRetries?: number } = { maxRetries: 2 },
) {
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
    ...(config.maxRetries !== undefined && { maxRetries: config.maxRetries }),
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

  it('HTML on 200 is an unexpected_response', async () => {
    const { http } = setup(() => new Response('<html>Maintenance</html>', { status: 200 }));
    const err = await failure(http.request({ method: 'GET', path: '/a' }));
    expect(err.kind).toBe('unexpected_response');
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

  it('aborting the caller signal mid-request rejects with cancelled and makes no retry', async () => {
    const { http, calls } = setup(
      (req) =>
        new Promise<Response>((_, reject) => {
          req.signal.addEventListener('abort', () => reject(req.signal.reason));
        }),
    );
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 5);
    const err = await failure(
      http.request({ method: 'GET', path: '/a' }, { signal: controller.signal }),
    );
    expect(err.kind).toBe('cancelled');
    expect(err.message).toBe('Légifrance: request cancelled.');
    expect(err.details?.source).toBe('legifrance');
    expect(calls).toHaveLength(1);
  });

  it('an already-aborted signal makes no call', async () => {
    const { http, calls } = setup(() => json({}));
    const err = await failure(
      http.request({ method: 'GET', path: '/a' }, { signal: AbortSignal.abort() }),
    );
    expect(err.kind).toBe('cancelled');
    expect(calls).toHaveLength(0);
  });

  it('cancellation during a backoff sleep stops retrying', async () => {
    const controller = new AbortController();
    const f = fakeFetch(() => json({}, 503));
    const http = createPisteHttp({
      baseUrl: 'https://x.test/base',
      source: 'legifrance',
      tokens: { getToken: async () => 'tok-1', invalidate: () => {} },
      fetch: f.fetch,
      maxRetries: 2,
      sleep: async () => {
        controller.abort();
      },
    });
    const err = await failure(
      http.request({ method: 'GET', path: '/a' }, { signal: controller.signal }),
    );
    expect(err.kind).toBe('cancelled');
    expect(f.calls).toHaveLength(1);
  });

  it('the default sleep is interrupted by the caller signal', async () => {
    const f = fakeFetch(() => json({}, 503));
    const http = createPisteHttp({
      baseUrl: 'https://x.test/base',
      source: 'legifrance',
      tokens: { getToken: async () => 'tok-1', invalidate: () => {} },
      fetch: f.fetch,
    });
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 20);
    const started = Date.now();
    const err = await failure(
      http.request({ method: 'GET', path: '/a' }, { signal: controller.signal }),
    );
    expect(err.kind).toBe('cancelled');
    expect(Date.now() - started).toBeLessThan(400);
  });

  it('cancellation after a 401 does not retry the refresh', async () => {
    const controller = new AbortController();
    const { http, calls } = setup(() => {
      controller.abort();
      return json({}, 401);
    });
    const err = await failure(
      http.request({ method: 'GET', path: '/a' }, { signal: controller.signal }),
    );
    expect(err.kind).toBe('cancelled');
    expect(calls).toHaveLength(1);
  });

  it('defaults are one retry and 10 s', async () => {
    expect(DEFAULT_MAX_RETRIES).toBe(1);
    expect(DEFAULT_TIMEOUT_MS).toBe(10_000);
    const { http, calls } = setup(() => json({}, 503), {});
    await failure(http.request({ method: 'GET', path: '/a' }));
    expect(calls).toHaveLength(2);
  });

  it('network errors log a code, not the URL', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { http } = setup(() => {
        throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
      });
      await failure(http.request({ method: 'GET', path: '/a' }, { maxRetries: 0 }));
      const lines = spy.mock.calls.map((c) => c.join(' '));
      expect(lines).toContain('vigueur: Légifrance network error (ENOTFOUND)');
      expect(lines.join('\n')).not.toContain('x.test');
    } finally {
      spy.mockRestore();
    }
  });
});

describe('secret-leak guard', () => {
  const echo = () => new Response('invalid header Authorization: Bearer tok-1', { status: 400 });
  const hang = (req: Request) =>
    new Promise<Response>((_, reject) => {
      req.signal.addEventListener('abort', () => reject(req.signal.reason));
    });
  const cases: [string, (req: Request) => Response | Promise<Response>, RequestOptions][] = [
    ['401 twice', () => json({ m: 'Bearer tok-1' }, 401), {}],
    ['403', () => new Response('Bearer tok-1', { status: 403 }), {}],
    ['404', () => new Response('Bearer tok-1', { status: 404 }), {}],
    ['400 echoing the token', echo, {}],
    ['429', () => new Response('Bearer tok-1', { status: 429 }), {}],
    ['503', () => new Response('Bearer tok-1', { status: 503 }), {}],
    [
      'network error',
      () => {
        throw Object.assign(new TypeError('fetch failed Bearer tok-1'), {
          cause: { code: 'ECONNRESET' },
        });
      },
      {},
    ],
    ['timeout', hang, { timeoutMs: 10, maxRetries: 0 }],
    ['HTML on 200', () => new Response('<html>Bearer tok-1</html>', { status: 200 }), {}],
  ];
  for (const [name, handler, opts] of cases) {
    it(`${name} leaks neither token nor Bearer`, async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const { http } = setup(handler);
        const err = await failure(http.request({ method: 'GET', path: '/a' }, opts));
        const dump = JSON.stringify({ m: err.message, d: err.details });
        expect(dump).not.toContain('tok-1');
        expect(dump).not.toContain('Bearer');
        expect(spy.mock.calls.join('\n')).not.toContain('tok-1');
      } finally {
        spy.mockRestore();
      }
    });
  }
});

describe('response size', () => {
  const capped = (body: string, headers: Record<string, string> = {}) =>
    createPisteHttp({
      baseUrl: 'https://x.test/base',
      source: 'legifrance',
      tokens: { getToken: async () => 'tok-1', invalidate: () => {} },
      fetch: fakeFetch(() => new Response(body, { headers })).fetch,
      maxBodyBytes: 20,
    });

  it('reads a body that starts with a byte-order mark', async () => {
    const { http } = setup(() => new Response('\uFEFF{"a":1}'));
    await expect(http.request({ method: 'GET', path: '/a' })).resolves.toEqual({ a: 1 });
  });

  it('reads a body up to the cap', async () => {
    await expect(
      capped('{"a":"0123456789ab"}').request({ method: 'GET', path: '/a' }),
    ).resolves.toEqual({
      a: '0123456789ab',
    });
  });

  it('stops reading a body over the cap: an unexpected response, not retried', async () => {
    const err = await failure(
      capped('{"a":"0123456789abc"}').request({ method: 'GET', path: '/a' }),
    );
    expect(err).toMatchObject({ kind: 'unexpected_response' });
    expect(err.message).toBe('Légifrance: response larger than 20 bytes, not read.');
  });

  it('refuses a body whose declared length is over the cap', async () => {
    const err = await failure(
      capped('{}', { 'content-length': '1000' }).request({ method: 'GET', path: '/a' }),
    );
    expect(err).toMatchObject({ kind: 'unexpected_response' });
  });
});

describe('400 body redaction', () => {
  for (const [name, prefix] of [
    ['with Bearer', 'Bearer '],
    ['without Bearer', ''],
  ] as const) {
    it(`redacts a token straddling the excerpt boundary (${name})`, async () => {
      const pad = 'x'.repeat(300 - prefix.length - 4);
      const body = JSON.stringify({ message: `${pad}${prefix}tok-1 tail` });
      const { http } = setup(() => new Response(body, { status: 400 }));
      const err = await failure(http.request({ method: 'GET', path: '/a' }));
      const dump = JSON.stringify({ m: err.message, d: err.details });
      for (let n = 4; n <= 5; n++) expect(dump).not.toContain('tok-1'.slice(0, n));
      expect(dump).not.toContain('Bearer');
    });
  }

  it('quotes only the message fields of a Légifrance or Judilibre error body', async () => {
    const legifrance = await failure(
      setup(() => json(loadFixture('65-err-lawDecree-unknown'), 400)).http.request({
        method: 'GET',
        path: '/a',
      }),
    );
    expect(legifrance.message).toBe(
      "Légifrance: request rejected (HTTP 400): L'expression à valider est fausse.",
    );
    const judilibre = await failure(
      setup(() => json(loadFixture('13-err-search-page-size-51', 'judilibre'), 400)).http.request({
        method: 'GET',
        path: '/a',
      }),
    );
    expect(judilibre.message).toBe(
      'Légifrance: request rejected (HTTP 400): Value of the page_size parameter must be an integer between 1 and 50.',
    );
  });

  it('quotes nothing from a body that is not a known error shape', async () => {
    const plain = await failure(
      setup(() => new Response('plain body', { status: 400 })).http.request({
        method: 'GET',
        path: '/a',
      }),
    );
    expect(plain.message).toBe('Légifrance: request rejected (HTTP 400).');
    const other = await failure(
      setup(() => json({ detail: 'x' }, 422)).http.request({ method: 'GET', path: '/a' }),
    );
    expect(other.message).toBe('Légifrance: request rejected (HTTP 422).');
  });

  it('leaves the excerpt intact when the token is empty', async () => {
    const f = fakeFetch(() => json({ message: 'plain body' }, 400));
    const http = createPisteHttp({
      baseUrl: 'https://x.test/base',
      source: 'legifrance',
      tokens: { getToken: async () => '', invalidate: () => {} },
      fetch: f.fetch,
    });
    const err = await failure(http.request({ method: 'GET', path: '/a' }));
    expect(err.message).toBe('Légifrance: request rejected (HTTP 400): plain body');
  });

  it('hands the request signal to the token provider', async () => {
    const seen: Array<AbortSignal | undefined> = [];
    const http = createPisteHttp({
      baseUrl: 'https://x.test/base',
      source: 'legifrance',
      tokens: {
        getToken: async (signal?: AbortSignal) => {
          seen.push(signal);
          return 'tok-1';
        },
        invalidate: () => {},
      },
      fetch: fakeFetch(() => json({})).fetch,
    });
    const controller = new AbortController();
    await http.request({ method: 'GET', path: '/a' }, { signal: controller.signal });
    expect(seen).toEqual([controller.signal]);
  });
});
