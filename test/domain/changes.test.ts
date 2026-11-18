import { describe, expect, it } from 'vitest';
import { sameWording } from '../../src/domain/changes.js';

const OLD_1382 =
  "Tout fait quelconque de l'homme, qui cause à autrui un dommage, oblige celui par la faute duquel il est arrivé à le réparer.";
const NEW_1382 =
  "Les présomptions qui ne sont pas établies par la loi, sont laissées à l'appréciation du juge, qui ne doit les admettre que si elles sont graves, précises et concordantes, et dans les cas seulement où la loi admet la preuve par tout moyen.";

describe('sameWording', () => {
  it('ignores typography alone: quote and dash styles, spacing', () => {
    const typeset = OLD_1382.replace("l'homme", 'l’homme').replace(', qui', ',\u00A0 qui');
    expect(sameWording(OLD_1382, typeset)).toBe(true);
  });
  it('a change of case, accent or punctuation is a different wording', () => {
    expect(sameWording(OLD_1382, OLD_1382.toUpperCase())).toBe(false);
    expect(sameWording(OLD_1382, OLD_1382.replace('à autrui', 'a autrui'))).toBe(false);
    expect(sameWording(OLD_1382, OLD_1382.replace(', qui', ' qui'))).toBe(false);
  });
  it('is false when the words differ', () => {
    expect(sameWording(OLD_1382, NEW_1382)).toBe(false);
  });
  it('compares empty texts as words', () => {
    expect(sameWording('', '')).toBe(true);
    expect(sameWording('', 'x')).toBe(false);
  });
});
