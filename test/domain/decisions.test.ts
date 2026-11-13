import { describe, expect, it } from 'vitest';
import {
  type DecisionIdentity,
  formatPourvoi,
  normalizeCaseNumber,
  normalizeEcli,
  pourvoiDigits,
  sameDecision,
} from '../../src/domain/decisions.js';

describe('pourvoiDigits', () => {
  it.each(['24-16.924', '2416924', '24-16924', 'n° 24-16.924', 'Pourvoi n° S 24-16.924'])(
    'reads %s',
    (raw) => {
      expect(pourvoiDigits(raw)).toBe('2416924');
    },
  );
  it('rejects other numbers', () => {
    expect(pourvoiDigits('23/000101')).toBeNull();
    expect(pourvoiDigits('2026-1217')).toBeNull();
  });
});

describe('formatPourvoi', () => {
  it('formats 7 digits', () => {
    expect(formatPourvoi('2416924')).toBe('24-16.924');
    expect(formatPourvoi('23/000101')).toBeNull();
  });
});

describe('normalizeEcli', () => {
  it('uppercases and trims', () => {
    expect(normalizeEcli(' ecli:fr:ccass:2025:so01200 ')).toBe('ECLI:FR:CCASS:2025:SO01200');
  });
  it('rejects malformed', () => {
    expect(normalizeEcli('ECLI:FR')).toBeNull();
  });
});

describe('normalizeCaseNumber', () => {
  it.each([
    ['judicial', 'n° S 24-16.924', '24-16.924'],
    ['judicial', '23/000101', '23/000101'],
    ['constitutional', '2026-1226 QPC', '2026-1226'],
    ['constitutional', 'n° 2026-1217/1218 QPC', '2026-1217/1218'],
    ['cnil', 'n°2026-023', '2026-023'],
    ['financial', 'n° S-2026-1111', 'S-2026-1111'],
    ['administrative', 'no  498  123', '498 123'],
  ] as const)('%s %s', (collection, raw, expected) => {
    expect(normalizeCaseNumber(collection, raw)).toBe(expected);
  });
});

describe('sameDecision', () => {
  const cc = (over: Partial<DecisionIdentity>): DecisionIdentity => ({
    ecli: null,
    courtOfCassation: true,
    date: '2026-09-17',
    pourvois: [],
    ...over,
  });
  it('same ECLI', () => {
    const e = 'ECLI:FR:CCASS:2025:SO01200';
    expect(sameDecision(cc({ ecli: e }), cc({ ecli: e, date: null }))).toBe(true);
  });
  it('same date and a shared pourvoi in different spellings, with duplicates', () => {
    expect(
      sameDecision(
        cc({ pourvois: ['24-17.365', '24-18.000'] }),
        cc({ pourvois: ['24-17.365', '24-18.000', '24-17.365'] }),
      ),
    ).toBe(true);
    expect(sameDecision(cc({ pourvois: ['2417365'] }), cc({ pourvois: ['24-17.365'] }))).toBe(true);
  });
  it('different dates', () => {
    expect(
      sameDecision(
        cc({ pourvois: ['24-17.365'] }),
        cc({ pourvois: ['24-17.365'], date: '2026-09-18' }),
      ),
    ).toBe(false);
  });
  it('different ECLIs despite matching numbers', () => {
    expect(
      sameDecision(
        cc({ ecli: 'ECLI:FR:CCASS:2026:C100001', pourvois: ['24-17.365'] }),
        cc({ ecli: 'ECLI:FR:CCASS:2026:C100002', pourvois: ['24-17.365'] }),
      ),
    ).toBe(false);
  });
  it('not Cour de cassation', () => {
    expect(
      sameDecision(
        cc({ pourvois: ['24-17.365'] }),
        cc({ pourvois: ['24-17.365'], courtOfCassation: false }),
      ),
    ).toBe(false);
  });
  it('same date, no shared pourvoi', () => {
    expect(sameDecision(cc({ pourvois: ['24-17.365'] }), cc({ pourvois: ['24-17.366'] }))).toBe(
      false,
    );
  });
  it('missing date', () => {
    expect(
      sameDecision(
        cc({ pourvois: ['24-17.365'], date: null }),
        cc({ pourvois: ['24-17.365'], date: null }),
      ),
    ).toBe(false);
  });
});
