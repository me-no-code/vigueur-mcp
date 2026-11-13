import { describe, expect, it } from 'vitest';
import { normaliseTextNumber, parseTextRef } from '../../../src/services/legislation/text-ref.js';

describe('normaliseTextNumber', () => {
  it.each([
    ['78-17', '78-17'],
    ['n° 78-17', '78-17'],
    ['N°78-17', '78-17'],
    ['n ° 78-17', '78-17'],
    ['no 78-17', '78-17'],
    ['No. 78-17', '78-17'],
    ['nº 78-17', '78-17'], // masculine ordinal indicator, often typed for "°"
    ['  78 - 17  ', '78-17'],
    ['78‑17', '78-17'], // non-breaking hyphen
    ['n° 78-17', '78-17'], // no-break space
  ])('%j → %j', (raw, expected) => {
    expect(normaliseTextNumber(raw)).toBe(expected);
  });
});

describe('parseTextRef', () => {
  it('reads Légifrance ids and NORs, uppercased', () => {
    expect(parseTextRef(' legitext000006068624 ')).toEqual({ id: 'LEGITEXT000006068624' });
    expect(parseTextRef('JORFTEXT000000886460')).toEqual({ id: 'JORFTEXT000000886460' });
    expect(parseTextRef('jusx7800001l')).toEqual({ nor: 'JUSX7800001L' });
  });

  it.each([
    ['loi 78-17', 'loi', '78-17'],
    ['Loi n° 78-17', 'loi', '78-17'],
    ['loi no 78-17', 'loi', '78-17'],
    ['Décret n° 2019-1088', 'decret', '2019-1088'],
    ['Décret  n° 2019-1088', 'decret', '2019-1088'], // double space
    ['Décret n° 2019-1088', 'decret', '2019-1088'], // NFD "é"
    ['DÉCRET N°2019-1088', 'decret', '2019-1088'],
    ['loi organique 2001-692', 'loi_organique', '2001-692'],
    ['loi  organique n° 2001-692', 'loi_organique', '2001-692'],
    ['loi_organique 2001-692', 'loi_organique', '2001-692'],
    ['arrêté 2021-5', 'arrete', '2021-5'],
    ['arrêté 2021-5', 'arrete', '2021-5'], // NFD "ê" and "é"
    ['ordonnance nº 2016-131', 'ordonnance', '2016-131'],
  ])('%j is nature %j, number %j', (raw, nature, number) => {
    expect(parseTextRef(raw)).toEqual({ nature, number });
  });

  it.each([
    'informatique et libertés',
    'loi',
    '78-17',
    'décret2019-1088',
    'code civil 1240',
    'loi 78 17',
    'Loi n° 78-17 du 6 janvier 1978',
  ])('%j is not a text reference', (raw) => {
    expect(parseTextRef(raw)).toBeNull();
  });
});
