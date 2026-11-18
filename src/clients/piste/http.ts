import type { ErrorKind } from '../../shared/errors.js';
import { VigueurError } from '../../shared/errors.js';
import type { FetchLike } from '../../shared/fetch.js';
import type { SourceId } from '../../shared/source-id.js';
import { SOURCE_LABELS } from '../../shared/source-id.js';
import type { TokenProvider } from './auth.js';

export interface PisteRequest {
  method: 'GET' | 'POST';
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
}

export interface RequestOptions {
  maxRetries?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface PisteHttp {
  request<T>(req: PisteRequest, opts?: RequestOptions): Promise<T>;
}

export const DEFAULT_MAX_RETRIES = 1;
export const DEFAULT_TIMEOUT_MS = 10_000;
/** The largest body read: tables of contents reach 19.3 MB (Code du travail). */
export const DEFAULT_MAX_BODY_BYTES = 64 * 1024 * 1024;
const MAX_RETRY_AFTER_WAIT_MS = 10_000;
const BACKOFF_BASE_MS = 500;
const BODY_EXCERPT_CHARS = 300;

// Resolves early when the signal aborts; callers re-check the signal afterwards.
const defaultSleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });

/**
 * The message fields of an error body: Légifrance's `message`, Judilibre's `errors[].msg`. Any
 * other body (not JSON, or another shape) gives nothing, so a reflected request never reaches an
 * answer whole.
 */
function upstreamMessage(text: string): string {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return '';
  }
  if (typeof body !== 'object' || body === null) return '';
  const o = body as { message?: unknown; errors?: unknown };
  const fromErrors = Array.isArray(o.errors)
    ? o.errors.map((e) =>
        typeof e === 'object' && e !== null ? (e as { msg?: unknown }).msg : null,
      )
    : [];
  return [o.message, ...fromErrors]
    .filter((m): m is string => typeof m === 'string' && m !== '')
    .join('; ');
}

function redact(text: string, token: string): string {
  const scrubbed = token === '' ? text : text.replaceAll(token, '[redacted]');
  return scrubbed.replace(/bearer\s+\S+/gi, '[redacted]');
}

function errorCode(err: unknown): string {
  if (err instanceof Error) {
    const code = (err.cause as { code?: unknown } | undefined)?.code;
    return typeof code === 'string' ? code : err.name;
  }
  return 'unknown';
}

function parseRetryAfter(value: string | null): number | undefined {
  if (value === null || !/^\d+$/.test(value.trim())) return undefined;
  const seconds = Number(value.trim());
  return Number.isSafeInteger(seconds) ? seconds : undefined;
}

/** The body as text; `null`, without reading it all, when it is over `max` bytes. */
async function readText(res: Response, max: number): Promise<string | null> {
  if (Number(res.headers.get('content-length')) > max) {
    await res.body?.cancel();
    return null;
  }
  if (res.body === null) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  // TextDecoder drops a leading byte-order mark, as res.text() does.
  return new TextDecoder().decode(Buffer.concat(chunks));
}

function isTimeout(err: unknown, signal: AbortSignal): boolean {
  return (
    (signal.aborted && signal.reason instanceof Error && signal.reason.name === 'TimeoutError') ||
    (err instanceof Error && err.name === 'TimeoutError')
  );
}

export function createPisteHttp(opts: {
  baseUrl: string;
  source: SourceId;
  tokens: TokenProvider;
  fetch?: FetchLike;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  maxRetries?: number;
  timeoutMs?: number;
  maxBodyBytes?: number;
}): PisteHttp {
  const doFetch: FetchLike = opts.fetch ?? ((input, init) => fetch(input, init));
  const sleep = opts.sleep ?? defaultSleep;
  const label = SOURCE_LABELS[opts.source];
  const maxBodyBytes = opts.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  const MB = 1024 * 1024;
  const maxBodyLabel =
    maxBodyBytes >= MB ? `${Math.round(maxBodyBytes / MB)} MB` : `${maxBodyBytes} bytes`;

  const fail = (kind: ErrorKind, message: string, status?: number, retryAfterSeconds?: number) =>
    new VigueurError(kind, `${label}: ${message}`, {
      source: opts.source,
      ...(status !== undefined && { status }),
      ...(retryAfterSeconds !== undefined && { retryAfterSeconds }),
    });

  const cancelled = () =>
    new VigueurError('cancelled', `${label}: request cancelled.`, { source: opts.source });

  async function request<T>(req: PisteRequest, ro?: RequestOptions): Promise<T> {
    const maxRetries = ro?.maxRetries ?? opts.maxRetries ?? DEFAULT_MAX_RETRIES;
    const timeoutMs = ro?.timeoutMs ?? opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    const url = new URL(opts.baseUrl + req.path);
    for (const [key, value] of Object.entries(req.query ?? {})) {
      if (value !== undefined) url.searchParams.append(key, String(value));
    }
    const hasBody = req.body !== undefined;
    const callerSignal = ro?.signal;

    const final = new WeakSet<VigueurError>(); // errors that must not be retried
    let attempt = 0;
    let refreshedToken = false;

    // Each loop iteration is one HTTP attempt; `retry` decides whether to go again.
    for (;;) {
      if (callerSignal?.aborted) throw cancelled();
      const token = await opts.tokens.getToken(callerSignal);
      if (callerSignal?.aborted) throw cancelled();
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      };
      if (hasBody) headers['Content-Type'] = 'application/json';
      const timeoutSignal = AbortSignal.timeout(timeoutMs);
      const signal = callerSignal ? AbortSignal.any([callerSignal, timeoutSignal]) : timeoutSignal;

      let failure: VigueurError;
      let waitMs = BACKOFF_BASE_MS * 2 ** attempt;
      try {
        const res = await doFetch(url, {
          method: req.method,
          headers,
          signal,
          // PISTE does not redirect; following one would send the request elsewhere.
          redirect: 'manual',
          ...(hasBody && { body: JSON.stringify(req.body) }),
        });
        if (res.status >= 300 && res.status < 400) {
          await res.body?.cancel();
          const moved = fail(
            'unexpected_response',
            `redirected (HTTP ${res.status}), not followed.`,
            res.status,
          );
          final.add(moved);
          throw moved;
        }
        const text = await readText(res, maxBodyBytes);
        if (text === null) {
          const big = fail(
            'unexpected_response',
            `response larger than ${maxBodyLabel}, not read.`,
            res.status,
          );
          final.add(big);
          throw big;
        }

        if (res.ok) {
          try {
            return JSON.parse(text) as T;
          } catch {
            const bad = fail(
              'unexpected_response',
              'unexpected response (not valid JSON)',
              res.status,
            );
            final.add(bad);
            throw bad;
          }
        }
        if (res.status === 401) {
          opts.tokens.invalidate();
          if (callerSignal?.aborted) throw cancelled();
          if (refreshedToken) {
            throw fail('credentials_invalid', 'credentials rejected (HTTP 401)', 401);
          }
          refreshedToken = true;
          continue;
        }
        if (res.status === 429) {
          const retryAfter = parseRetryAfter(res.headers.get('retry-after'));
          if (retryAfter !== undefined)
            waitMs = Math.min(retryAfter * 1000, MAX_RETRY_AFTER_WAIT_MS);
          failure = fail('quota_exceeded', 'rate limit reached (HTTP 429)', 429, retryAfter);
        } else if (res.status >= 500) {
          failure = fail('upstream_unavailable', `service error (HTTP ${res.status})`, res.status);
        } else if (res.status === 403) {
          throw fail('forbidden', 'access refused (HTTP 403)', 403);
        } else if (res.status === 404) {
          throw fail('not_found', 'not found (HTTP 404)', 404);
        } else {
          // Known message fields only, then redacted (in case one echoes the token), then cut.
          const excerpt = redact(upstreamMessage(text), token).slice(0, BODY_EXCERPT_CHARS);
          throw fail(
            'invalid_input',
            `request rejected (HTTP ${res.status})${excerpt === '' ? '.' : `: ${excerpt}`}`,
            res.status,
          );
        }
      } catch (err) {
        if (callerSignal?.aborted) throw cancelled();
        if (err instanceof VigueurError) {
          if (
            final.has(err) ||
            (err.kind !== 'quota_exceeded' && err.kind !== 'upstream_unavailable')
          ) {
            throw err;
          }
          failure = err;
        } else if (isTimeout(err, signal)) {
          failure = fail('upstream_unavailable', `request timed out after ${timeoutMs} ms`);
        } else {
          console.error(`vigueur: ${label} network error (${errorCode(err)})`);
          failure = fail('upstream_unavailable', 'network error while contacting the service');
        }
      }

      if (attempt >= maxRetries) throw failure;
      attempt++;
      await sleep(waitMs, callerSignal);
      if (callerSignal?.aborted) throw cancelled();
    }
  }

  return { request };
}
