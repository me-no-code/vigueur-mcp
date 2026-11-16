import type {
  CallContext,
  JudilibreRepository,
  TaxonomyList,
} from '../../services/case-law/ports.js';
import { VigueurError } from '../../shared/errors.js';
import type { PisteHttp } from '../piste/http.js';
import { mapDecision, mapSearch, mapTaxonomy, searchParams } from './wire.js';

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

const TAXONOMY_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function createJudilibreClient(
  http: PisteHttp,
  now: () => Date = () => new Date(),
): JudilibreRepository {
  const taxonomies = new Map<string, { fetchedAt: Date; entries: TaxonomyList['entries'] }>();

  return {
    search: (q, ctx) => getJson(http, '/search', searchParams(q), ctx, mapSearch),

    async getDecision(id, ctx) {
      // Only `id`: `query` rewrites the text and shifts the zones.
      try {
        return await getJson(http, '/decision', { id }, ctx, mapDecision);
      } catch (err) {
        if (err instanceof VigueurError && err.kind === 'not_found') return null;
        throw err;
      }
    },

    async taxonomy(id, context, ctx) {
      const key = `${id}|${context}`;
      const hit = taxonomies.get(key);
      if (hit !== undefined && now().getTime() - hit.fetchedAt.getTime() < TAXONOMY_MAX_AGE_MS) {
        return { entries: hit.entries, fetchedAt: hit.fetchedAt };
      }
      const entries = await getJson(
        http,
        '/taxonomy',
        { id, context_value: context },
        ctx,
        mapTaxonomy,
      );
      const fetchedAt = now();
      taxonomies.set(key, { fetchedAt, entries });
      return { entries, fetchedAt };
    },
  };
}
