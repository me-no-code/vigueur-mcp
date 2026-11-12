import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PisteHttp, PisteRequest, RequestOptions } from '../../src/clients/piste/http.js';

const FIXTURES = join(import.meta.dirname, '..', 'fixtures', 'legifrance');

/** Parses `test/fixtures/legifrance/<name>.json` (the `.json` extension is optional). */
export function loadFixture(name: string): unknown {
  const file = name.endsWith('.json') ? name : `${name}.json`;
  return JSON.parse(readFileSync(join(FIXTURES, file), 'utf8'));
}

export interface FakeRoute {
  path: string;
  /** Extra condition on the request body; routes are tried in order. */
  when?: (body: unknown) => boolean;
  /** Fixture name, read afresh on every call. */
  fixture?: string;
  /** Inline response body, or an Error to throw (used when `fixture` is absent). */
  reply?: unknown;
}

export interface RecordedCall {
  req: PisteRequest;
  opts: RequestOptions | undefined;
}

/** A `PisteHttp` answering from fixtures by request path (and optionally body); records every call. */
export function fakePisteHttp(routes: readonly FakeRoute[]): {
  http: PisteHttp;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const http: PisteHttp = {
    async request<T>(req: PisteRequest, opts?: RequestOptions): Promise<T> {
      calls.push({ req, opts });
      const route = routes.find((r) => r.path === req.path && (r.when?.(req.body) ?? true));
      if (route === undefined) {
        throw new Error(`fakePisteHttp: no route for ${req.method} ${req.path}`);
      }
      if (route.fixture !== undefined) return loadFixture(route.fixture) as T;
      if (route.reply instanceof Error) throw route.reply;
      return route.reply as T;
    },
  };
  return { http, calls };
}
