import type { CallContext, JudilibreRepository } from '../../services/case-law/ports.js';
import { VigueurError } from '../../shared/errors.js';
import type { PisteHttp } from '../piste/http.js';
import { mapSearch, searchParams } from './wire.js';

/** GETs from Judilibre and maps the body; any mapping failure is an unexpected response. */
export async function getJson<T>(
  http: PisteHttp,
  path: string,
  query: Record<string, string | number | undefined>,
  ctx: CallContext | undefined,
  map: (raw: unknown) => T,
): Promise<T> {
  const raw = await http.request<unknown>(
    { method: 'GET', path, query },
    ctx?.signal ? { signal: ctx.signal } : undefined,
  );
  try {
    return map(raw);
  } catch (err) {
    if (err instanceof VigueurError) throw err;
    const detail = err instanceof Error ? err.message : String(err);
    throw new VigueurError(
      'unexpected_response',
      `Judilibre: unexpected response from ${path} (${detail}).`,
      { source: 'judilibre' },
    );
  }
}

export function createJudilibreClient(http: PisteHttp): JudilibreRepository {
  return {
    search: (q, ctx) => getJson(http, '/search', searchParams(q), ctx, mapSearch),
  };
}
