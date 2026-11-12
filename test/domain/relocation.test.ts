import { describe, expect, it } from 'vitest';
import { assessRelocation } from '../../src/domain/relocation.js';

const OLD_1382 =
  "Tout fait quelconque de l'homme, qui cause à autrui un dommage, oblige celui par la faute duquel il est arrivé à le réparer.";
const NEW_1382 =
  "Les présomptions qui ne sont pas établies par la loi, sont laissées à l'appréciation du juge, qui ne doit les admettre que si elles sont graves, précises et concordantes, et dans les cas seulement où la loi admet la preuve par tout moyen.";
const PREAVIS_A = "Le délai de préavis est d'un mois.";
const PREAVIS_B = 'Le délai de préavis est de deux mois.';

describe('assessRelocation', () => {
  it('replaced text moved by concordance and section change', () => {
    const ref = {
      id: 'LEGIARTI000032041571',
      num: '1240',
      codeTitle: 'Code civil',
      label: 'Code civil - art. 1240 (V)',
    };
    expect(
      assessRelocation({
        earlierText: OLD_1382,
        laterText: NEW_1382,
        concordanceTo: [ref],
        sectionChanged: true,
      }),
    ).toEqual({
      change: 'replaced',
      movedTo: [ref],
      evidence: ['concordance', 'text_similarity', 'section_change'],
    });
  });
  it('plain amendment has no evidence', () => {
    expect(
      assessRelocation({
        earlierText: PREAVIS_A,
        laterText: PREAVIS_B,
        concordanceTo: [],
        sectionChanged: false,
      }),
    ).toEqual({ change: 'amended', movedTo: [], evidence: [] });
  });
  it('missing later text counts as replaced', () => {
    expect(
      assessRelocation({
        earlierText: PREAVIS_A,
        laterText: null,
        concordanceTo: [],
        sectionChanged: false,
      }),
    ).toMatchObject({ change: 'replaced', evidence: ['text_similarity'] });
  });
});
