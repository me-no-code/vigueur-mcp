import { describe, expect, it, vi } from 'vitest';
import { type ErrorKind, VigueurError } from '../../src/shared/errors.js';
import { MAX_TOOL_TEXT } from '../../src/tools/format.js';
import { toolError } from '../../src/tools/tool-error.js';
import { expectToolError } from '../helpers/answer.js';

const hints: Record<
  Exclude<ErrorKind, 'quota_exceeded' | 'not_found' | 'invalid_input' | 'cancelled' | 'deadline'>,
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
};

const request = { tool: 'legifrance_get_article' };

describe('toolError hints', () => {
  for (const [kind, hint] of Object.entries(hints)) {
    it(`appends the hint for ${kind}`, () => {
      const e = expectToolError(
        toolError(new VigueurError(kind as ErrorKind, 'msg'), { source: 'legifrance', request }),
        kind,
      );
      expect(e.error.message).toBe(`msg ${hint}`);
    });
  }

  it('names the source of an unexpected_response', () => {
    const e = expectToolError(
      toolError(new VigueurError('unexpected_response', 'x', { source: 'judilibre' }), {
        source: 'legifrance',
        request,
      }),
      'unexpected_response',
    );
    expect(e.source).toBe('Judilibre');
    expect(e.error.message).toContain('Judilibre returned a response');
  });

  it('includes the retry delay for quota_exceeded when known, a generic hint otherwise', () => {
    const known = toolError(new VigueurError('quota_exceeded', 'msg', { retryAfterSeconds: 30 }), {
      source: 'legifrance',
      request,
    });
    expect(expectToolError(known, 'quota_exceeded').error.message).toContain('Retry in about 30 s');
    const unknown = toolError(new VigueurError('quota_exceeded', 'msg'), {
      source: 'legifrance',
      request,
    });
    expect(expectToolError(unknown, 'quota_exceeded').error.message).toContain('Wait a moment');
  });

  it('adds no hint for not_found, invalid_input, cancelled and deadline', () => {
    for (const kind of ['not_found', 'invalid_input', 'cancelled', 'deadline'] as const) {
      const e = expectToolError(
        toolError(new VigueurError(kind, 'exact message'), { source: 'legifrance', request }),
        kind,
      );
      expect(e.error.message).toBe('exact message');
    }
  });
});

describe('toolError size', () => {
  it('logs one stderr line for an error over MAX_TOOL_TEXT, and answers unchanged', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const message = 'm'.repeat(MAX_TOOL_TEXT);
      const r = toolError(new VigueurError('invalid_input', message), {
        source: 'legifrance',
        request,
      });
      const e = expectToolError(r, 'invalid_input');
      expect(e.error.message).toBe(message);
      const text = (r.content as Array<{ text: string }>)[0]?.text ?? '';
      expect(errors).toHaveBeenCalledTimes(1);
      expect(errors).toHaveBeenCalledWith(
        `legifrance_get_article answer (Légifrance, error) is ${text.length} characters, over the ${MAX_TOOL_TEXT}-character cap.`,
      );
      toolError(new VigueurError('invalid_input', 'short'), { source: 'legifrance', request });
      expect(errors).toHaveBeenCalledTimes(1);
    } finally {
      errors.mockRestore();
    }
  });
});
