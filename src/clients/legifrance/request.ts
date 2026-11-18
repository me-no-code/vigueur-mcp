import type { CallContext, HistoryEntry } from '../../services/legislation/ports.js';
import { VigueurError } from '../../shared/errors.js';
import type { PisteHttp } from '../piste/http.js';
import { stripMarks } from './wire.js';

// Shared by the Légifrance client modules. Légifrance JSON never leaves `clients/legifrance`;
// bodies are read field by field and a missing required field is reported as an unexpected
// response (see `postJson`). The shape helpers live in `../json.ts`.

export { asObj, isObj, keyed, list, lookup, type Obj, optStr, shape, str } from '../json.js';

/** Article number as displayed: no highlight tags, single spaces. */
export const cleanNum = (s: string) => stripMarks(s).replace(/\s+/g, ' ').trim();
/** Comparison key: the requested number may differ from the official one in case and spacing. */
export const numKey = (s: string) => cleanNum(s).toLowerCase();

export const HISTORY_ACTIONS: Readonly<Record<string, HistoryEntry['action']>> = {
  CREATION: 'creation',
  MODIFICATION: 'modification',
  ABROGATION: 'abrogation',
  CODIFICATION: 'codification',
  DEPLACEMENT: 'transfer',
};

/**
 * Per-request timeout for the large bodies (whole texts, code tables of contents: 19.3 MB for the
 * Code du travail, change logs), which the default timeout cuts short on a slow connection. It
 * stays under the 45 s call deadline, which still bounds the whole call.
 */
export const LARGE_BODY_TIMEOUT_MS = 30_000;

/** POSTs to Légifrance and maps the body; any mapping failure is an unexpected response. */
export async function postJson<T>(
  http: PisteHttp,
  path: string,
  body: unknown,
  ctx: CallContext | undefined,
  map: (raw: unknown) => T,
  opts: { timeoutMs?: number } = {},
): Promise<T> {
  const raw = await http.request<unknown>(
    { method: 'POST', path, body },
    {
      ...(ctx?.signal !== undefined && { signal: ctx.signal }),
      ...(opts.timeoutMs !== undefined && { timeoutMs: opts.timeoutMs }),
    },
  );
  try {
    return map(raw);
  } catch (err) {
    if (err instanceof VigueurError) throw err;
    const detail = err instanceof Error ? err.message : String(err);
    throw new VigueurError(
      'unexpected_response',
      `Légifrance: unexpected response from ${path} (${detail}).`,
      { source: 'legifrance' },
    );
  }
}

/** The one 400 that means "no such text" on a consult call. */
const UNKNOWN_ID_MESSAGE = "L'expression à valider est fausse";

export function isUnknownId(err: unknown): boolean {
  return (
    err instanceof VigueurError &&
    err.kind === 'invalid_input' &&
    err.message.includes('HTTP 400') &&
    err.message.includes(UNKNOWN_ID_MESSAGE)
  );
}
