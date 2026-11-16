import { describe, expect, it } from 'vitest';
import type { PisteHttp, PisteRequest, RequestOptions } from '../../../src/clients/piste/http.js';
import { probeJudilibre, probeLegifrance } from '../../../src/clients/piste/probes.js';
import type { ErrorKind } from '../../../src/shared/errors.js';
import { VigueurError } from '../../../src/shared/errors.js';

function stub(result: unknown | Error) {
  const calls: Array<{ req: PisteRequest; opts?: RequestOptions }> = [];
  const http: PisteHttp = {
    async request<T>(req: PisteRequest, opts?: RequestOptions): Promise<T> {
      calls.push({ req, opts });
      if (result instanceof Error) throw result;
      return result as T;
    },
  };
  return { http, calls };
}

describe('probes', () => {
  it('legifrance: POST /list/code with no retries and 8 s timeout', async () => {
    const { http, calls } = stub({});
    expect(await probeLegifrance(http)).toEqual({ source: 'legifrance', state: 'ok' });
    expect(calls).toEqual([
      {
        req: { method: 'POST', path: '/list/code', body: { pageNumber: 1, pageSize: 1 } },
        opts: { maxRetries: 0, timeoutMs: 8000 },
      },
    ]);
  });

  it('judilibre: GET /healthcheck with no retries and 8 s timeout', async () => {
    const { http, calls } = stub('ok');
    expect(await probeJudilibre(http)).toEqual({ source: 'judilibre', state: 'ok' });
    expect(calls).toEqual([
      { req: { method: 'GET', path: '/healthcheck' }, opts: { maxRetries: 0, timeoutMs: 8000 } },
    ]);
  });

  const cases: Array<[ErrorKind, string]> = [
    ['forbidden', 'not_enabled'],
    ['credentials_invalid', 'credentials_invalid'],
    ['quota_exceeded', 'quota_exceeded'],
  ];
  for (const [kind, state] of cases) {
    it(`maps ${kind} to ${state}`, async () => {
      const { http } = stub(new VigueurError(kind, 'msg'));
      expect(await probeLegifrance(http)).toEqual({ source: 'legifrance', state });
      expect(await probeJudilibre(http)).toEqual({ source: 'judilibre', state });
    });
  }

  it('carries retryAfterSeconds for quota_exceeded', async () => {
    const { http } = stub(new VigueurError('quota_exceeded', 'msg', { retryAfterSeconds: 12 }));
    expect(await probeLegifrance(http)).toEqual({
      source: 'legifrance',
      state: 'quota_exceeded',
      retryAfterSeconds: 12,
    });
  });

  it('maps upstream_unavailable to unavailable with detail', async () => {
    const { http } = stub(new VigueurError('upstream_unavailable', 'Judilibre: timed out'));
    expect(await probeJudilibre(http)).toEqual({
      source: 'judilibre',
      state: 'unavailable',
      detail: 'Judilibre: timed out',
    });
  });

  // PISTE answered, but not as expected: a 404, another 4xx, or a body Vigueur cannot read.
  for (const kind of ['not_found', 'invalid_input', 'unexpected_response'] as const) {
    it(`maps ${kind} to unexpected_response with detail`, async () => {
      const { http } = stub(new VigueurError(kind, 'Légifrance: not found (HTTP 404)'));
      expect(await probeLegifrance(http)).toEqual({
        source: 'legifrance',
        state: 'unexpected_response',
        detail: 'Légifrance: not found (HTTP 404)',
      });
    });
  }

  // No answer in time: the call's deadline or cancel stopped the probe.
  for (const kind of ['deadline', 'cancelled'] as const) {
    it(`maps ${kind} to unavailable with detail`, async () => {
      const { http } = stub(new VigueurError(kind, 'Légifrance: request cancelled.'));
      expect(await probeLegifrance(http)).toEqual({
        source: 'legifrance',
        state: 'unavailable',
        detail: 'Légifrance: request cancelled.',
      });
    });
  }

  it('maps a non-VigueurError to unavailable with its message', async () => {
    const { http } = stub(new Error('weird'));
    expect(await probeLegifrance(http)).toEqual({
      source: 'legifrance',
      state: 'unavailable',
      detail: 'weird',
    });
  });

  it('passes the status call signal to the request', async () => {
    const { http, calls } = stub({});
    const signal = new AbortController().signal;
    await probeLegifrance(http, { signal });
    await probeJudilibre(http, { signal });
    expect(calls.map((c) => c.opts?.signal)).toEqual([signal, signal]);
  });
});
