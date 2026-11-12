import { describe, expect, it } from 'vitest';
import { classifyChange, searchPhrase, textSimilarity } from '../../src/domain/changes.js';

const OLD_1382 =
  "Tout fait quelconque de l'homme, qui cause à autrui un dommage, oblige celui par la faute duquel il est arrivé à le réparer.";
const NEW_1382 =
  "Les présomptions qui ne sont pas établies par la loi, sont laissées à l'appréciation du juge, qui ne doit les admettre que si elles sont graves, précises et concordantes, et dans les cas seulement où la loi admet la preuve par tout moyen.";
const PREAVIS_A = "Le délai de préavis est d'un mois.";
const PREAVIS_B = 'Le délai de préavis est de deux mois.';

describe('textSimilarity', () => {
  it('is 1 for identical texts and 0 for disjoint ones', () => {
    expect(textSimilarity(PREAVIS_A, PREAVIS_A)).toBe(1);
    expect(textSimilarity('alpha beta', 'gamma delta')).toBe(0);
  });
  it('computes Dice over word pairs', () => {
    expect(textSimilarity(PREAVIS_A, PREAVIS_B)).toBeCloseTo(4 / 7, 3);
  });
  it('is 0 when either side is empty', () => {
    expect(textSimilarity('', PREAVIS_A)).toBe(0);
    expect(textSimilarity('', '')).toBe(0);
  });
  it('falls back to word sets under 2 words', () => {
    expect(textSimilarity('Abrogé', 'abrogé.')).toBe(1);
    expect(textSimilarity('Abrogé', 'Modifié')).toBe(0);
  });
});

describe('classifyChange', () => {
  it('detects a replacement', () => {
    expect(classifyChange(OLD_1382, NEW_1382)).toBe('replaced');
  });
  it('detects an amendment', () => {
    expect(classifyChange(PREAVIS_A, PREAVIS_B)).toBe('amended');
  });
  it('ignores typography and case', () => {
    expect(classifyChange(OLD_1382, OLD_1382.replace("l'homme", 'l’homme').toUpperCase())).toBe(
      'unchanged',
    );
  });
  it('treats an empty side as replaced, two empties as unchanged', () => {
    expect(classifyChange('', PREAVIS_A)).toBe('replaced');
    expect(classifyChange('', '')).toBe('unchanged');
  });
});

describe('searchPhrase', () => {
  it('returns the first clause of at least 4 words', () => {
    expect(searchPhrase(OLD_1382)).toBe("Tout fait quelconque de l'homme");
    expect(searchPhrase(OLD_1382, 3)).toBe('Tout fait quelconque');
    expect(
      searchPhrase('Sauf disposition contraire, le délai court à compter de la notification.'),
    ).toBe('le délai court à compter de la notification');
  });
  it('falls back to the whole text', () => {
    expect(searchPhrase('Abrogé.')).toBe('Abrogé');
    expect(searchPhrase('')).toBe('');
    expect(searchPhrase('  ')).toBe('');
  });
  it('straightens curly apostrophes', () => {
    expect(searchPhrase('Tout fait de l’homme')).toBe("Tout fait de l'homme");
  });
});
