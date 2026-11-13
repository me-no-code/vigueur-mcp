import { describe, expect, it } from 'vitest';
import { createTokenProvider } from '../../../src/clients/piste/auth.js';
import { VigueurError } from '../../../src/shared/errors.js';
import { fakeFetch } from '../../helpers/fake-fetch.js';

const TOKEN_URL = 'https://oauth.example/token';
const tokenResponse = () =>
  Response.json({ access_token: 'tok-1', token_type: 'Bearer', expires_in: 3600 });

function provider(
  handler: (req: Request) => Response | Promise<Response>,
  now: () => number = () => 0,
) {
  const ff = fakeFetch(handler);
  const tp = createTokenProvider({
    tokenUrl: TOKEN_URL,
    clientId: 'id-123',
    clientSecret: 'secret-456',
    fetch: ff.fetch,
    now,
  });
  return { tp, calls: ff.calls };
}

describe('createTokenProvider', () => {
  it('posts client credentials as form data', async () => {
    const { tp, calls } = provider(tokenResponse);
    await expect(tp.getToken()).resolves.toBe('tok-1');
    expect(calls).toHaveLength(1);
    const req = calls[0] as Request;
    expect(req.method).toBe('POST');
    expect(req.url).toBe(TOKEN_URL);
    // A redirect would resend the form body, client secret included, to another address.
    expect(req.redirect).toBe('error');
    expect(req.headers.get('content-type')).toBe('application/x-www-form-urlencoded');
    expect(Object.fromEntries(new URLSearchParams(await req.text()))).toEqual({
      grant_type: 'client_credentials',
      client_id: 'id-123',
      client_secret: 'secret-456',
      scope: 'openid',
    });
  });

  it('caches until 60 s before expiry', async () => {
    let t = 0;
    const { tp, calls } = provider(tokenResponse, () => t);
    await tp.getToken();
    await tp.getToken();
    expect(calls).toHaveLength(1);
    t = (3600 - 61) * 1000;
    await tp.getToken();
    expect(calls).toHaveLength(1);
    t = (3600 - 60) * 1000;
    await tp.getToken();
    expect(calls).toHaveLength(2);
  });

  it('shares one in-flight request', async () => {
    const { tp, calls } = provider(tokenResponse);
    await Promise.all([tp.getToken(), tp.getToken(), tp.getToken()]);
    expect(calls).toHaveLength(1);
  });

  it('invalidate() forces a new token', async () => {
    const { tp, calls } = provider(tokenResponse);
    await tp.getToken();
    tp.invalidate();
    await tp.getToken();
    expect(calls).toHaveLength(2);
  });

  it('maps 401 to credentials_invalid without leaking the secret', async () => {
    const { tp } = provider(
      () =>
        new Response('{"error":"invalid_client","client_secret":"secret-456"}', { status: 401 }),
    );
    const err = await tp.getToken().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(VigueurError);
    expect((err as VigueurError).kind).toBe('credentials_invalid');
    expect((err as VigueurError).message).not.toContain('secret-456');
    expect((err as VigueurError).message).not.toContain('id-123');
  });

  it('maps network failure to upstream_unavailable', async () => {
    const { tp } = provider(() => {
      throw new TypeError('fetch failed');
    });
    const err = await tp.getToken().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(VigueurError);
    expect((err as VigueurError).kind).toBe('upstream_unavailable');
    expect((err as VigueurError).message).not.toContain('fetch failed');
  });

  it('maps 503 to upstream_unavailable', async () => {
    const { tp } = provider(() => new Response('down', { status: 503 }));
    await expect(tp.getToken()).rejects.toMatchObject({ kind: 'upstream_unavailable' });
  });

  it('maps a timeout to upstream_unavailable', async () => {
    const ff = fakeFetch(() => {
      throw new DOMException('aborted', 'TimeoutError');
    });
    const tp = createTokenProvider({
      tokenUrl: TOKEN_URL,
      clientId: 'id-123',
      clientSecret: 'secret-456',
      fetch: ff.fetch,
    });
    await expect(tp.getToken()).rejects.toMatchObject({
      kind: 'upstream_unavailable',
      message: 'PISTE authentication timed out.',
    });
  });

  it('maps a malformed token response to upstream_unavailable', async () => {
    const { tp } = provider(() => Response.json({ access_token: 'x' }));
    await expect(tp.getToken()).rejects.toMatchObject({ kind: 'upstream_unavailable' });
    const { tp: tp2 } = provider(() => new Response('<html>maintenance</html>'));
    await expect(tp2.getToken()).rejects.toMatchObject({ kind: 'upstream_unavailable' });
  });

  it('retries after a failed in-flight request', async () => {
    let n = 0;
    const { tp, calls } = provider(() =>
      n++ === 0 ? new Response('down', { status: 503 }) : tokenResponse(),
    );
    await expect(tp.getToken()).rejects.toBeInstanceOf(VigueurError);
    await expect(tp.getToken()).resolves.toBe('tok-1');
    expect(calls).toHaveLength(2);
  });

  it('an aborted waiter rejects as cancelled without aborting the shared request', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { tp, calls } = provider(async () => {
      await gate;
      return tokenResponse();
    });
    const controller = new AbortController();
    const first = tp.getToken(controller.signal).catch((e: unknown) => e);
    const second = tp.getToken();
    controller.abort();
    expect(await first).toMatchObject({ kind: 'cancelled' });
    release();
    await expect(second).resolves.toBe('tok-1');
    expect(calls).toHaveLength(1);
  });

  it('an already-aborted signal rejects as cancelled', async () => {
    const { tp } = provider(tokenResponse);
    await expect(tp.getToken(AbortSignal.abort())).rejects.toMatchObject({ kind: 'cancelled' });
  });
});
