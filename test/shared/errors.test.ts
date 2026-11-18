import { describe, expect, it } from 'vitest';
import { VigueurError } from '../../src/shared/errors.js';

describe('VigueurError', () => {
  it('carries name, kind and details', () => {
    const err = new VigueurError('forbidden', 'x', { source: 'judilibre', status: 403 });
    expect(err.name).toBe('VigueurError');
    expect(err.kind).toBe('forbidden');
    expect(err.details?.status).toBe(403);
  });
});
