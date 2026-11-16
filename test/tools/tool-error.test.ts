import { describe, expect, it, vi } from 'vitest';
import { type ErrorKind, VigueurError } from '../../src/shared/errors.js';
import { callSignal } from '../../src/tools/format.js';
import { toToolError } from '../../src/tools/tool-error.js';

const hints: Record<
  Exclude<ErrorKind, 'quota_exceeded' | 'not_found' | 'invalid_input' | 'cancelled'>,
  string
> = {
  credentials_missing:
    'PISTE credentials are not configured. Call vigueur_status for setup instructions.',
  credentials_invalid:
    'PISTE rejected the credentials. Check PISTE_CLIENT_ID and PISTE_CLIENT_SECRET, and PISTE_ENV (sandbox credentials only work with PISTE_ENV=sandbox). In Claude Code with the Vigueur plugin, they are the plugin settings: change them with /plugin configure vigueur@vigueur, then reconnect with /mcp. In another MCP client, they are environment variables in its configuration. Call vigueur_status to diagnose.',
  api_not_enabled:
    'This API is not enabled on your PISTE application. Call vigueur_status for the steps to enable it.',
  forbidden:
    'PISTE refused this request (HTTP 403). Call vigueur_status to check that the API is enabled on your PISTE application.',
  upstream_unavailable:
    'PISTE is unavailable or timed out. Wait a moment and try again; if it persists, call vigueur_status.',
  unexpected_response:
    'Légifrance returned a response Vigueur does not understand (possibly an API change). Try again later; if it persists, report it.',
  deadline: 'Légifrance did not answer within 45 s; try again in a moment.',
};

describe('toToolError', () => {
  for (const [kind, hint] of Object.entries(hints)) {
    it(`appends the hint for ${kind}`, () => {
      const result = toToolError(new VigueurError(kind as ErrorKind, 'msg'));
      expect(result.isError).toBe(true);
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toEqual({ type: 'text', text: `msg\n\n${hint}` });
    });
  }

  it('names the source of an unexpected_response', () => {
    const result = toToolError(
      new VigueurError('unexpected_response', 'x', { source: 'judilibre' }),
    );
    expect((result.content[0] as { text: string }).text).toContain('Judilibre returned a response');
  });

  it('includes retry delay for quota_exceeded when known', () => {
    const result = toToolError(
      new VigueurError('quota_exceeded', 'msg', { retryAfterSeconds: 30 }),
    );
    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(1);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('msg');
    expect(text).toContain('Retry in about 30 s');
  });

  it('uses a generic hint for quota_exceeded otherwise', () => {
    const result = toToolError(new VigueurError('quota_exceeded', 'msg'));
    expect((result.content[0] as { text: string }).text).toContain('Wait a moment');
  });

  it('adds no hint for not_found and invalid_input', () => {
    for (const kind of ['not_found', 'invalid_input'] as const) {
      const result = toToolError(new VigueurError(kind, 'exact message'));
      expect(result.isError).toBe(true);
      expect(result.content).toEqual([{ type: 'text', text: 'exact message' }]);
    }
  });

  it('passes cancelled through without a hint', () => {
    const result = toToolError(new VigueurError('cancelled', 'Request cancelled.'));
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{ type: 'text', text: 'Request cancelled.' }]);
  });

  it('wraps unknown errors and logs the stack', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = toToolError(new Error('boom'));
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toMatch(/^Unexpected error: boom/);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  describe('with a call signal', () => {
    const fired = async (mcp?: AbortSignal) => {
      const signal = callSignal(mcp, 10);
      await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }));
      return signal;
    };
    const textOf = (r: ReturnType<typeof toToolError>) => (r.content[0] as { text: string }).text;

    it('deadline fired + cancelled renders the deadline hint', async () => {
      const result = toToolError(new VigueurError('cancelled', 'x'), await fired());
      expect(textOf(result)).toContain('did not answer within 45 s');
    });

    it('deadline fired + an abort-named error renders the deadline hint', async () => {
      const abort = new DOMException('aborted', 'AbortError');
      expect(textOf(toToolError(abort, await fired()))).toContain('did not answer within 45 s');
    });

    it('deadline fired + a genuine failure is not masked', async () => {
      const result = toToolError(new VigueurError('invalid_input', 'bad date'), await fired());
      expect(textOf(result)).toBe('bad date');
    });

    it('deadline fired names the source it was given', async () => {
      const result = toToolError(new VigueurError('cancelled', 'x'), await fired(), 'judilibre');
      expect(textOf(result)).toContain('Judilibre did not answer in time.');
      expect(textOf(result)).toContain('Judilibre did not answer within 45 s');
    });

    it('MCP cancel (deadline not fired) + cancelled renders the normal cancelled text', () => {
      const mcp = new AbortController();
      const signal = callSignal(mcp.signal, 60_000);
      mcp.abort();
      const result = toToolError(new VigueurError('cancelled', 'Request cancelled.'), signal);
      expect(textOf(result)).toBe('Request cancelled.');
    });
  });
});
