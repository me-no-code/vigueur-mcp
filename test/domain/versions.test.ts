import { describe, expect, it } from 'vitest';
import { type ArticleVersion, versionAt } from '../../src/domain/versions.js';

const OLD_1382 =
  "Tout fait quelconque de l'homme, qui cause à autrui un dommage, oblige celui par la faute duquel il est arrivé à le réparer.";
const NEW_1382 =
  "Les présomptions qui ne sont pas établies par la loi, sont laissées à l'appréciation du juge, qui ne doit les admettre que si elles sont graves, précises et concordantes, et dans les cas seulement où la loi admet la preuve par tout moyen.";

const v1: ArticleVersion = {
  id: 'v1',
  number: '1382',
  text: OLD_1382,
  status: 'amended',
  validFrom: '1804-02-19',
  validTo: '2016-10-01',
};
const v2: ArticleVersion = {
  id: 'v2',
  number: '1240',
  text: NEW_1382,
  status: 'in_force',
  validFrom: '2016-10-01',
  validTo: null,
};
const v3: ArticleVersion = {
  id: 'v3',
  number: '1240',
  text: 'x',
  status: 'in_force',
  validFrom: '2020-01-01',
  validTo: null,
};

describe('versionAt', () => {
  it('selects the version in force on the date, whatever the input order', () => {
    const input = [v2, v1];
    expect(versionAt(input, '2015-06-01')).toBe(v1);
    expect(versionAt(input, '2016-10-01')).toBe(v2);
    expect(versionAt(input, '2026-11-12')).toBe(v2);
    expect(versionAt(input, '1800-01-01')).toBeNull();
  });

  it('prefers the latest validFrom among overlapping matches', () => {
    expect(versionAt([v1, v2, v3], '2021-01-01')).toBe(v3);
  });

  it('does not mutate its input', () => {
    const input = [v2, v1];
    versionAt(input, '2015-06-01');
    expect(input).toEqual([v2, v1]);
  });
});
