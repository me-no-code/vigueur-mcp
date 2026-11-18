import { describe, expect, it } from 'vitest';
import { assessRelocation } from '../../src/domain/relocation.js';

const OLD_1382 =
  "Tout fait quelconque de l'homme, qui cause à autrui un dommage, oblige celui par la faute duquel il est arrivé à le réparer.";
const NEW_1382 =
  "Les présomptions qui ne sont pas établies par la loi, sont laissées à l'appréciation du juge, qui ne doit les admettre que si elles sont graves, précises et concordantes, et dans les cas seulement où la loi admet la preuve par tout moyen.";
const PREAVIS_A = "Le délai de préavis est d'un mois.";
const PREAVIS_B = 'Le délai de préavis est de deux mois.';
const REF_1240 = {
  id: 'LEGIARTI000032041571',
  num: '1240',
  codeTitle: 'Code civil',
  label: 'Code civil - art. 1240 (V)',
};

describe('assessRelocation', () => {
  it('keeps the concordance and compares the wording', () => {
    expect(
      assessRelocation({ earlierText: OLD_1382, laterText: NEW_1382, concordanceTo: [REF_1240] }),
    ).toEqual({ sameWording: false, movedTo: [REF_1240] });
  });
  it('an amendment has a different wording and no move', () => {
    expect(
      assessRelocation({ earlierText: PREAVIS_A, laterText: PREAVIS_B, concordanceTo: [] }),
    ).toEqual({ sameWording: false, movedTo: [] });
  });
  it('the same words in another typography are the same wording', () => {
    expect(
      assessRelocation({
        earlierText: PREAVIS_A,
        laterText: PREAVIS_A.replace("d'un", 'd’un'),
        concordanceTo: [],
      }),
    ).toEqual({ sameWording: true, movedTo: [] });
  });
  it('without a later text, the wording is unknown', () => {
    expect(
      assessRelocation({ earlierText: PREAVIS_A, laterText: null, concordanceTo: [] }),
    ).toEqual({ sameWording: null, movedTo: [] });
  });
});
