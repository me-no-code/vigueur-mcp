import { describe, expect, it } from 'vitest';
import { isIsoDate, isoDateInParis } from '../../src/domain/dates.js';

describe('isIsoDate', () => {
  it.each([
    ['2024-03-12', true],
    ['2024-02-29', true],
    ['2023-02-29', false],
    ['2024-02-30', false],
    ['2024-13-01', false],
    ['2024-3-12', false],
    ['', false],
  ])('%j → %s', (input, expected) => {
    expect(isIsoDate(input)).toBe(expected);
  });
});

describe('isoDateInParis', () => {
  it.each([
    ['2026-11-11T23:30:00Z', '2026-11-12'], // CET (UTC+1): already the next day in Paris
    ['2026-11-11T22:59:00Z', '2026-11-11'],
    ['2026-07-01T21:59:00Z', '2026-07-01'], // CEST (UTC+2)
    ['2026-07-01T22:01:00Z', '2026-07-02'],
    ['0999-12-31T12:00:00Z', '0999-12-31'], // year padded to four digits
  ])('%s → %s', (at, expected) => {
    expect(isoDateInParis(new Date(at))).toBe(expected);
  });
});
