import { describe, expect, it } from 'vitest';
import { consistencyWarnings, statusAt } from '../../src/domain/status-at.js';

describe('statusAt', () => {
  it('in force from validFrom with open end', () => {
    const v = { status: 'in_force', validFrom: '2016-10-01', validTo: null } as const;
    expect(statusAt(v, '2026-11-12')).toEqual({
      inForce: true,
      reason: 'in_force',
      from: '2016-10-01',
      until: null,
    });
    expect(statusAt(v, '2015-01-01')).toMatchObject({
      inForce: false,
      reason: 'not_yet_in_force',
    });
  });
  it('repeal_pending is in force until validTo', () => {
    const v = { status: 'repeal_pending', validFrom: '2008-05-01', validTo: '2027-01-01' } as const;
    expect(statusAt(v, '2026-11-12')).toMatchObject({ inForce: true, reason: 'in_force' });
  });
  it('deferred is not yet in force', () => {
    const v = { status: 'deferred', validFrom: '2027-01-01', validTo: null } as const;
    expect(statusAt(v, '2026-11-12')).toEqual({
      inForce: false,
      reason: 'not_yet_in_force',
      from: '2027-01-01',
      until: null,
    });
  });
  it('stillborn never applied despite inverted dates', () => {
    const v = { status: 'stillborn', validFrom: '2022-01-01', validTo: '2017-12-22' } as const;
    expect(statusAt(v, '2020-01-01')).toMatchObject({ inForce: false, reason: 'never_applied' });
  });
  it('ended at validTo (exclusive)', () => {
    const v = { status: 'amended', validFrom: '1804-03-21', validTo: '2016-10-01' } as const;
    expect(statusAt(v, '2016-10-01')).toMatchObject({
      inForce: false,
      reason: 'ended',
      until: '2016-10-01',
    });
    expect(statusAt(v, '2016-09-30')).toMatchObject({ inForce: true });
  });
  it('unknown start counts as since the beginning', () => {
    const v = { status: 'in_force', validFrom: null, validTo: null } as const;
    expect(statusAt(v, '1900-01-01')).toMatchObject({ inForce: true, from: null });
  });
});

describe('consistencyWarnings', () => {
  const link = (effectiveDate: string | null) =>
    ({
      kind: 'abrogation',
      textTitle: 'Ordonnance n°2007-329 du 12 mars 2007',
      effectiveDate,
    }) as const;
  it('warns when in force but abrogation already effective', () => {
    const w = consistencyWarnings({ status: 'in_force' }, [link('2008-05-01')], '2026-11-12');
    expect(w).toEqual([
      'Légifrance marks this version in force, but also records its abrogation by Ordonnance n°2007-329 du 12 mars 2007 (effective 2008-05-01).',
    ]);
  });
  it('no warning for future, null date, other kinds or other statuses', () => {
    expect(consistencyWarnings({ status: 'in_force' }, [link('2030-01-01')], '2026-11-12')).toEqual(
      [],
    );
    expect(consistencyWarnings({ status: 'in_force' }, [link(null)], '2026-11-12')).toEqual([]);
    expect(
      consistencyWarnings(
        { status: 'in_force' },
        [{ kind: 'modification', textTitle: 'x', effectiveDate: '2000-01-01' }],
        '2026-11-12',
      ),
    ).toEqual([]);
    expect(consistencyWarnings({ status: 'repealed' }, [link('2008-05-01')], '2026-11-12')).toEqual(
      [],
    );
  });
  it('deferred also qualifies', () => {
    expect(
      consistencyWarnings({ status: 'deferred' }, [link('2008-05-01')], '2026-11-12'),
    ).toHaveLength(1);
  });
});
