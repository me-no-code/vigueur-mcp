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

  it('maps upstream_unavailable to unavailable with detail', async () => {
    const { http } = stub(new VigueurError('upstream_unavailable', 'Judilibre: timed out'));
    expect(await probeJudilibre(http)).toEqual({
      source: 'judilibre',
      state: 'unavailable',
      detail: 'Judilibre: timed out',
    });
  });

  it('maps any other VigueurError kind to unavailable', async () => {
    const { http } = stub(new VigueurError('not_found', 'nope'));
    expect(await probeLegifrance(http)).toEqual({
      source: 'legifrance',
      state: 'unavailable',
      detail: 'nope',
    });
  });

  it('maps a non-VigueurError to unavailable with its message', async () => {
    const { http } = stub(new Error('weird'));
    expect(await probeLegifrance(http)).toEqual({
      source: 'legifrance',
      state: 'unavailable',
      detail: 'weird',
    });
  });
});
