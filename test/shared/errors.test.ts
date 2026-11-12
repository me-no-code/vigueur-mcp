import { describe, expect, it } from 'vitest';
import { VigueurError } from '../../src/shared/errors.js';
import { SOURCE_LABELS } from '../../src/shared/source-id.js';

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
