import { VigueurError } from '../../shared/errors.js';
import type { FetchLike } from '../../shared/fetch.js';

export interface TokenProvider {
  getToken(signal?: AbortSignal): Promise<string>;
  invalidate(): void;
}

interface CachedToken {
  value: string;
  refreshAt: number;
}

const EXPIRY_MARGIN_SECONDS = 60;

const cancelled = () => new VigueurError('cancelled', 'PISTE authentication cancelled.');

/** `p`, or a `cancelled` rejection as soon as `signal` aborts; `p` itself is left running. */
function waitFor(p: Promise<string>, signal: AbortSignal | undefined): Promise<string> {
  if (signal === undefined) return p;
  return new Promise<string>((resolve, reject) => {
    const onAbort = () => reject(cancelled());
    signal.addEventListener('abort', onAbort, { once: true });
    p.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

export function createTokenProvider(opts: {
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  fetch?: FetchLike;
  now?: () => number;
  timeoutMs?: number;
}): TokenProvider {
  const doFetch: FetchLike = opts.fetch ?? ((input, init) => fetch(input, init));
  const now = opts.now ?? Date.now;
  const timeoutMs = opts.timeoutMs ?? 10_000;

  let cached: CachedToken | undefined;
  let inFlight: Promise<string> | undefined;

  async function requestToken(): Promise<CachedToken> {
    const obtainedAt = now();
    let res: Response;
    try {
      res = await doFetch(opts.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: opts.clientId,
          client_secret: opts.clientSecret,
          scope: 'openid',
        }).toString(),
        signal: AbortSignal.timeout(timeoutMs),
        // A 307/308 would resend this body, client secret included, to wherever it points: a
        // redirect is answered as it is, and fails below as a non-2xx status.
        redirect: 'manual',
      });
    } catch (err) {
      const timedOut = err instanceof Error && err.name === 'TimeoutError';
      throw new VigueurError(
        'upstream_unavailable',
        timedOut
          ? 'PISTE authentication timed out.'
          : 'PISTE authentication failed: network error.',
      );
    }

    if (res.status === 400 || res.status === 401) {
      throw new VigueurError(
        'credentials_invalid',
        `PISTE rejected the credentials (HTTP ${res.status}).`,
        { status: res.status },
      );
    }
    if (!res.ok) {
      throw new VigueurError(
        'upstream_unavailable',
        `PISTE authentication is unavailable (HTTP ${res.status}).`,
        { status: res.status },
      );
    }

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = undefined;
    }
    const accessToken = (body as { access_token?: unknown } | null | undefined)?.access_token;
    const expiresIn = (body as { expires_in?: unknown } | null | undefined)?.expires_in;
    if (typeof accessToken !== 'string' || typeof expiresIn !== 'number') {
      throw new VigueurError(
        'upstream_unavailable',
        'PISTE authentication returned an unexpected response.',
      );
    }
    return {
      value: accessToken,
      refreshAt: obtainedAt + (expiresIn - EXPIRY_MARGIN_SECONDS) * 1000,
    };
  }

  return {
    getToken(signal) {
      if (signal?.aborted) return Promise.reject(cancelled());
      if (cached && now() < cached.refreshAt) return Promise.resolve(cached.value);
      if (inFlight === undefined) {
        const request: Promise<string> = requestToken()
          .then((token) => {
            if (inFlight === request) cached = token;
            return token.value;
          })
          .finally(() => {
            if (inFlight === request) inFlight = undefined;
          });
        inFlight = request;
      }
      return waitFor(inFlight, signal);
    },
    invalidate() {
      cached = undefined;
      inFlight = undefined;
    },
  };
}
