import { describe, expect, it } from 'vitest';
import { textForceAt } from '../../src/domain/text-force.js';

const D = '2026-11-13';
const a = (validFrom: string | null, validTo: string | null) => ({ validFrom, validTo });

describe('textForceAt', () => {
  it('is in force when one article covers the date (half-open)', () => {
    expect(textForceAt([a('2000-01-01', '2010-01-01'), a('2020-01-01', null)], D)).toEqual({
      verdict: 'in_force',
    });
    expect(textForceAt([a('2000-01-01', D)], D).verdict).not.toBe('in_force');
    expect(textForceAt([a(D, null)], D).verdict).toBe('in_force');
  });

  it('ended: the latest real validTo', () => {
    expect(textForceAt([a('2000-01-01', '2010-01-01'), a('2000-01-01', '2019-06-01')], D)).toEqual({
      verdict: 'ended',
      on: '2019-06-01',
    });
  });

  it('not_yet: the earliest future start', () => {
    expect(textForceAt([a('2028-01-01', null), a('2027-03-01', null)], D)).toEqual({
      verdict: 'not_yet',
      on: '2027-03-01',
    });
  });

  it('a degenerate or sentinel article alone is undetermined, never in force', () => {
    expect(textForceAt([a(null, null)], D)).toEqual({ verdict: 'undetermined', on: null });
    expect(textForceAt([a('2999-01-01', '2999-01-01')], D).verdict).not.toBe('in_force');
    expect(textForceAt([a('2010-01-01', '2010-01-01')], D)).toEqual({
      verdict: 'undetermined',
      on: null,
    });
  });

  it('ignores every label but stillborn: the dates decide', () => {
    expect(textForceAt([{ ...a('2000-01-01', null), status: 'repealed' }], D).verdict).toBe(
      'in_force',
    );
    expect(textForceAt([{ ...a('2000-01-01', null), status: 'amended' }], D).verdict).toBe(
      'in_force',
    );
    expect(textForceAt([{ ...a('2000-01-01', null), status: 'stillborn' }], D).verdict).not.toBe(
      'in_force',
    );
  });

  it('an unknown start with a future end is undetermined', () => {
    expect(textForceAt([a(null, '2030-01-01')], D)).toEqual({ verdict: 'undetermined', on: null });
  });

  it('an unknown start never covers; no articles is undetermined', () => {
    expect(textForceAt([a(null, '2030-01-01')], D).verdict).not.toBe('in_force');
    expect(textForceAt([], D)).toEqual({ verdict: 'undetermined', on: null });
  });
});
