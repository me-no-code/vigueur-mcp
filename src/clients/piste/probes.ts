import type { SourceHealth, StatusContext } from '../../services/status.js';
import { VigueurError } from '../../shared/errors.js';
import type { SourceId } from '../../shared/source-id.js';
import type { PisteHttp, PisteRequest } from './http.js';

const PROBE_OPTIONS = { maxRetries: 0, timeoutMs: 8000 } as const;

async function probe(
  http: PisteHttp,
  source: SourceId,
  req: PisteRequest,
  ctx?: StatusContext,
): Promise<SourceHealth> {
  try {
    await http.request(req, ctx?.signal ? { ...PROBE_OPTIONS, signal: ctx.signal } : PROBE_OPTIONS);
    return { source, state: 'ok' };
  } catch (err) {
    if (err instanceof VigueurError) {
      switch (err.kind) {
        case 'forbidden':
          return { source, state: 'not_enabled' };
        case 'credentials_invalid':
          return { source, state: 'credentials_invalid' };
        case 'quota_exceeded':
          return err.details?.retryAfterSeconds !== undefined
            ? { source, state: 'quota_exceeded', retryAfterSeconds: err.details.retryAfterSeconds }
            : { source, state: 'quota_exceeded' };
        // PISTE answered, but not as expected: a 404, another 4xx, or an unreadable body.
        case 'not_found':
        case 'invalid_input':
        case 'unexpected_response':
          return { source, state: 'unexpected_response', detail: err.message };
        default:
          return { source, state: 'unavailable', detail: err.message };
      }
    }
    return {
      source,
      state: 'unavailable',
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

export function probeLegifrance(http: PisteHttp, ctx?: StatusContext): Promise<SourceHealth> {
  return probe(
    http,
    'legifrance',
    { method: 'POST', path: '/list/code', body: { pageNumber: 1, pageSize: 1 } },
    ctx,
  );
}

export function probeJudilibre(http: PisteHttp, ctx?: StatusContext): Promise<SourceHealth> {
  return probe(http, 'judilibre', { method: 'GET', path: '/healthcheck' }, ctx);
}
