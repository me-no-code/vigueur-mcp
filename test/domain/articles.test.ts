import { describe, expect, it } from 'vitest';
import { normalizeArticleNumber } from '../../src/domain/articles.js';

describe('normalizeArticleNumber', () => {
  it.each([
    ['L. 1234-5', 'L1234-5'],
    ['L 1234-5', 'L1234-5'],
    ['l1234-5', 'L1234-5'],
    ['L1234–5', 'L1234-5'],
    ['L. 1234-5', 'L1234-5'],
    ['R.4127-1', 'R4127-1'],
    ['D. 3141-1', 'D3141-1'],
    ['A. 123-4', 'A123-4'],
    ['L.O. 141', 'LO141'],
    ['LO 141', 'LO141'],
    [' 1240 ', '1240'],
    ['1240-1', '1240-1'],
    ['6bis', '6 bis'],
    ['6 bis', '6 bis'],
    ['premier', '1er'],
    ['1er', '1er'],
    ['L. 1234\u20111', 'L1234-1'], // U+2011 non-breaking hyphen (Word)
    ['L. 1234\u22121', 'L1234-1'], // U+2212 minus sign
  ])('%j → %j', (input, expected) => {
    expect(normalizeArticleNumber(input)).toBe(expected);
  });
});
