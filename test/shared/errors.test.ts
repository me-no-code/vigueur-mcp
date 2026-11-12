import { describe, expect, it, vi } from 'vitest';
import { type ErrorKind, toToolError, VigueurError } from '../../src/shared/errors.js';
import { SOURCE_LABELS } from '../../src/shared/source-id.js';

const hints: Record<
  Exclude<ErrorKind, 'quota_exceeded' | 'not_found' | 'invalid_input'>,
  string
> = {
  credentials_missing:
    'PISTE credentials are not configured. Call vigueur_status for setup instructions.',
  credentials_invalid:
    'PISTE rejected the credentials. Check PISTE_CLIENT_ID and PISTE_CLIENT_SECRET, and PISTE_ENV (sandbox credentials only work with PISTE_ENV=sandbox). Call vigueur_status to diagnose.',
  api_not_enabled:
    'This API is not enabled on your PISTE application. Call vigueur_status for the steps to enable it.',
  forbidden:
    'PISTE refused this request (HTTP 403). Call vigueur_status to check that the API is enabled on your PISTE application.',
  upstream_unavailable:
    'PISTE is unavailable or timed out. Wait a moment and try again; if it persists, call vigueur_status.',
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

  it('wraps unknown errors and logs the stack', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = toToolError(new Error('boom'));
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toMatch(/^Unexpected error: boom/);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('VigueurError', () => {
  it('carries name, kind and details', () => {
    const err = new VigueurError('forbidden', 'x', { source: 'judilibre', status: 403 });
    expect(err.name).toBe('VigueurError');
    expect(err.kind).toBe('forbidden');
    expect(err.details?.status).toBe(403);
  });
});

describe('SOURCE_LABELS', () => {
  it('labels sources', () => {
    expect(SOURCE_LABELS.legifrance).toBe('Légifrance');
    expect(SOURCE_LABELS.judilibre).toBe('Judilibre');
  });
});
