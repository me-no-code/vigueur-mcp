import { describe, expect, it } from 'vitest';
import {
  collapseSpaces,
  normalizeTypography,
  replaceTypographyChars,
} from '../../src/domain/text.js';

describe('normalizeTypography', () => {
  it.each([
    ['l’article L. 1234–1 nº', "l'article L. 1234-1 n°"],
    ['L. 1234-1', 'L. 1234-1'],
    ['L. 1234-1', 'L. 1234-1'],
    ['L. 1234-1', 'L. 1234-1'],
    ['‘a’', "'a'"],
    ['a — b', 'a - b'],
    ['a   b   c', 'a b c'],
    ['plain ascii', 'plain ascii'],
  ])('%j → %j', (input, expected) => {
    expect(normalizeTypography(input)).toBe(expected);
  });
});

describe('replaceTypographyChars (length-preserving step)', () => {
  it.each(['l’article L. 1234–1 nº', 'a    — ‘b’ º', '   '])('keeps the length of %j', (input) => {
    expect(replaceTypographyChars(input)).toHaveLength(input.length);
  });

  it.each([
    ['U+2009 thin space', '\u2009', ' '],
    ['U+200A hair space', '\u200A', ' '],
    ['U+02BC modifier-letter apostrophe', '\u02BC', "'"],
    ['U+2010 hyphen', '\u2010', '-'],
    ['U+2011 non-breaking hyphen', '\u2011', '-'],
    ['U+2012 figure dash', '\u2012', '-'],
    ['U+2212 minus sign', '\u2212', '-'],
  ])('maps %s one-for-one', (_name, char, expected) => {
    expect(replaceTypographyChars(`a${char}b`)).toBe(`a${expected}b`);
  });

  it('does not collapse spaces', () => {
    expect(replaceTypographyChars('a   b')).toBe('a   b');
  });
});

describe('collapseSpaces', () => {
  it('collapses runs of spaces only', () => {
    expect(collapseSpaces('a   b  c')).toBe('a b c');
  });
});
