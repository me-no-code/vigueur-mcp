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
}

export interface PisteHttp {
  request<T>(req: PisteRequest, opts?: RequestOptions): Promise<T>;
}

const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_RETRY_AFTER_WAIT_MS = 10_000;
const BACKOFF_BASE_MS = 500;
const BODY_EXCERPT_CHARS = 300;

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function parseRetryAfter(value: string | null): number | undefined {
  if (value === null || !/^\d+$/.test(value.trim())) return undefined;
  const seconds = Number(value.trim());
  return Number.isSafeInteger(seconds) ? seconds : undefined;
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
  sleep?: (ms: number) => Promise<void>;
  maxRetries?: number;
  timeoutMs?: number;
}): PisteHttp {
  const doFetch: FetchLike = opts.fetch ?? ((input, init) => fetch(input, init));
  const sleep = opts.sleep ?? defaultSleep;
  const label = SOURCE_LABELS[opts.source];

  const fail = (kind: ErrorKind, message: string, status?: number, retryAfterSeconds?: number) =>
    new VigueurError(kind, `${label}: ${message}`, {
      source: opts.source,
      ...(status !== undefined && { status }),
      ...(retryAfterSeconds !== undefined && { retryAfterSeconds }),
    });

  async function request<T>(req: PisteRequest, ro?: RequestOptions): Promise<T> {
    const maxRetries = ro?.maxRetries ?? opts.maxRetries ?? DEFAULT_MAX_RETRIES;
    const timeoutMs = ro?.timeoutMs ?? opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    const url = new URL(opts.baseUrl + req.path);
    for (const [key, value] of Object.entries(req.query ?? {})) {
      if (value !== undefined) url.searchParams.append(key, String(value));
    }
    const hasBody = req.body !== undefined;

    const final = new WeakSet<VigueurError>(); // errors that must not be retried
    let attempt = 0;
    let refreshedToken = false;

    // Each loop iteration is one HTTP attempt; `retry` decides whether to go again.
    for (;;) {
      const token = await opts.tokens.getToken();
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      };
      if (hasBody) headers['Content-Type'] = 'application/json';
      const signal = AbortSignal.timeout(timeoutMs);

      let failure: VigueurError;
      let waitMs = BACKOFF_BASE_MS * 2 ** attempt;
      try {
        const res = await doFetch(url, {
          method: req.method,
          headers,
          signal,
          // PISTE does not redirect; following one would send the request elsewhere.
          redirect: 'error',
          ...(hasBody && { body: JSON.stringify(req.body) }),
        });
        const text = await res.text();

        if (res.ok) {
          try {
            return JSON.parse(text) as T;
          } catch {
            const bad = fail(
              'upstream_unavailable',
              'unexpected response (not valid JSON)',
              res.status,
            );
            final.add(bad);
            throw bad;
          }
        }
        if (res.status === 401) {
          opts.tokens.invalidate();
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
          throw fail(
            'invalid_input',
            `request rejected (HTTP ${res.status}): ${text.slice(0, BODY_EXCERPT_CHARS)}`,
            res.status,
          );
        }
      } catch (err) {
        if (err instanceof VigueurError) {
          if (
            final.has(err) ||
            (err.kind !== 'quota_exceeded' && err.kind !== 'upstream_unavailable')
          ) {
            throw err;
          }
          failure = err;
        } else {
          failure = isTimeout(err, signal)
            ? fail('upstream_unavailable', `request timed out after ${timeoutMs} ms`)
            : fail('upstream_unavailable', 'network error while contacting the service');
        }
      }

      if (attempt >= maxRetries) throw failure;
      attempt++;
      await sleep(waitMs);
    }
  }

  return { request };
}
