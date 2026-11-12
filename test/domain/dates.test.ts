import { describe, expect, it } from 'vitest';
import { isIsoDate, isoDateInParis, parseFrenchDate } from '../../src/domain/dates.js';

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

describe('parseFrenchDate', () => {
  it.each([
    ['12 mars 2024', '2024-03-12'],
    ['1er janvier 1978', '1978-01-01'],
    ['6 janvier 1978', '1978-01-06'],
    ['10 oct. 2023', '2023-10-10'],
    ['3 févr. 2021', '2021-02-03'],
    ['3 fevr. 2021', '2021-02-03'],
    ['3 février 2021', '2021-02-03'],
    ['17 nov. 2000', '2000-11-17'],
    ['12/03/2024', '2024-03-12'],
    ['12 mars 2024', '2024-03-12'],
    ['  12   MARS 2024 ', '2024-03-12'],
    ['15 août 2020', '2020-08-15'],
    ['15 aout 2020', '2020-08-15'],
    ['1 déc. 1999', '1999-12-01'],
    ['1 dec. 1999', '1999-12-01'],
    ['29 février 2024', '2024-02-29'],
    ['4 janv. 2020', '2020-01-04'],
    ['4 avr. 2020', '2020-04-04'],
    ['4 juil. 2020', '2020-07-04'],
    ['4 sept. 2020', '2020-09-04'],
    ['4 mai 2020', '2020-05-04'],
    ['4 juin 2020', '2020-06-04'],
    ['4 avril 2020', '2020-04-04'],
    ['4 juillet 2020', '2020-07-04'],
    ['4 septembre 2020', '2020-09-04'],
    ['4 octobre 2020', '2020-10-04'],
    ['4 novembre 2020', '2020-11-04'],
    ['4 décembre 2020', '2020-12-04'],
    ['12\u202Fmars\u20092024', '2024-03-12'], // narrow no-break space, thin space
  ])('%j → %j', (input, expected) => {
    expect(parseFrenchDate(input)).toBe(expected);
  });

  it.each([
    '31 février 2020',
    '29 février 2023',
    '31 avril 2020',
    '0 mars 2020',
    '32 mars 2020',
    '31/02/2020',
    'mars 2024',
    '12 marz 2024',
    '2er mars 2024',
    '',
    'hier',
  ])('rejects %j', (input) => {
    expect(parseFrenchDate(input)).toBeNull();
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
