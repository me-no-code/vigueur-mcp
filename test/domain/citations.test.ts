import { describe, expect, it } from 'vitest';
import { parseCitations } from '../../src/domain/citations.js';

const NBSP = ' ';
const NNBSP = ' ';

describe('parseCitations — code articles', () => {
  it('article L. 1234-1 du Code du travail (case 1)', () => {
    const input = 'Selon l’article L. 1234-1 du Code du travail, le salarié…';
    expect(parseCitations(input)).toMatchObject([
      {
        kind: 'code_article',
        article: 'L1234-1',
        code: 'Code du travail',
        raw: 'article L. 1234-1 du Code du travail',
        start: 8,
        end: 44,
      },
    ]);
  });

  it('art. 1240 C. civ. (case 2)', () => {
    expect(parseCitations('art. 1240 C. civ.')).toMatchObject([
      { kind: 'code_article', article: '1240', code: 'Code civil', raw: 'art. 1240 C. civ.' },
    ]);
  });

  it('C. trav., art. L1234-5 (case 3)', () => {
    expect(parseCitations('C. trav., art. L1234-5')).toMatchObject([
      {
        kind: 'code_article',
        article: 'L1234-5',
        code: 'Code du travail',
        raw: 'C. trav., art. L1234-5',
      },
    ]);
  });

  it('articles 1240 et 1241 du Code civil → two citations sharing the span (case 4)', () => {
    const raw = 'articles 1240 et 1241 du Code civil';
    expect(parseCitations(`les ${raw}`)).toMatchObject([
      { kind: 'code_article', article: '1240', code: 'Code civil', raw, start: 4 },
      { kind: 'code_article', article: '1241', code: 'Code civil', raw, start: 4 },
    ]);
  });

  it('articles L. 1234-1 à L. 1234-5 → both bounds of the range (case 5)', () => {
    expect(parseCitations('articles L. 1234-1 à L. 1234-5 du Code du travail')).toMatchObject([
      { kind: 'code_article', article: 'L1234-1', code: 'Code du travail' },
      { kind: 'code_article', article: 'L1234-5', code: 'Code du travail' },
    ]);
  });

  it('does not attach a code-first citation whose article belongs to a text', () => {
    expect(parseCitations('Code civil, article 9 de la loi n° 78-17')).toMatchObject([
      { kind: 'text_article', article: '9', text: { nature: 'loi', number: '78-17' } },
    ]);
  });

  it.each([
    ['CGI, art. 150-0 A', '150-0 A'],
    ['CGI, art. 199 undecies B', '199 undecies B'],
    ['article 199 terdecies-0 A du CGI', '199 terdecies-0 A'],
  ])('keeps capital-letter and Latin suffixes: %j', (input, article) => {
    expect(parseCitations(input)).toMatchObject([
      { kind: 'code_article', article, code: 'Code général des impôts', raw: input },
    ]);
  });

  it('code-first never drops a suffix to reach a terminator (9 bis belongs to the loi)', () => {
    expect(
      parseCitations('Code civil, article 9 bis de la loi n° 78-17 du 6 janvier 1978'),
    ).toMatchObject([
      {
        kind: 'text_article',
        article: '9 bis',
        text: { nature: 'loi', number: '78-17', date: '1978-01-06' },
        raw: 'article 9 bis de la loi n° 78-17 du 6 janvier 1978',
      },
    ]);
  });

  it('code-first never shortens a list to reach a terminator', () => {
    const text = { nature: 'loi', number: '78-17' };
    expect(parseCitations('C. civ., art. 1240 et 1241 de la loi n° 78-17')).toMatchObject([
      { kind: 'text_article', article: '1240', text },
      { kind: 'text_article', article: '1241', text },
    ]);
  });

  it.each([
    '(C. trav., art. L. 1234-1)',
    'C. trav., art. L. 1234-1, al. 2',
    'C. trav., art. L. 1234-1 al. 2',
    'C. trav., art. L. 1234-1 alinéa 2',
    'C. trav., art. L. 1234-1 et s.',
    'C. trav., art. L. 1234-1\nLe salarié',
  ])('code-first ends at punctuation, end of line, "et"/"à" or an alinéa: %j', (input) => {
    expect(parseCitations(input)).toMatchObject([
      { kind: 'code_article', article: 'L1234-1', raw: 'C. trav., art. L. 1234-1' },
    ]);
  });

  it('code-first without a terminator is not a citation', () => {
    expect(parseCitations('C. trav., art. L. 1234-1 prévoit que')).toEqual([]);
  });

  it.each([
    "l'article 21 du Code civil local",
    'article L. 122-1 du Code du travail applicable à Mayotte',
    'article 102 du Code du travail maritime',
    'article 166 du Code pénal local',
  ])('does not attribute %j to the code whose title it merely starts with', (input) => {
    expect(parseCitations(input).filter((c) => c.kind === 'code_article')).toEqual([]);
  });
});

describe('parseCitations — texts', () => {
  it('article 9 de la loi n° 78-17 du 6 janvier 1978 (case 6)', () => {
    expect(parseCitations('l’article 9 de la loi n° 78-17 du 6 janvier 1978')).toMatchObject([
      {
        kind: 'text_article',
        article: '9',
        text: { nature: 'loi', number: '78-17', date: '1978-01-06' },
        raw: 'article 9 de la loi n° 78-17 du 6 janvier 1978',
      },
    ]);
  });

  it('ordonnance n° 2016-131 du 10 février 2016 (case 7)', () => {
    expect(parseCitations('ordonnance n° 2016-131 du 10 février 2016')).toMatchObject([
      { kind: 'text', text: { nature: 'ordonnance', number: '2016-131', date: '2016-02-10' } },
    ]);
  });

  it('décret n°2019-1088 has no date key (case 8)', () => {
    const [citation, ...rest] = parseCitations('décret n°2019-1088');
    expect(rest).toEqual([]);
    expect(citation).toMatchObject({
      kind: 'text',
      text: { nature: 'decret', number: '2019-1088' },
    });
    expect(citation).toEqual({
      kind: 'text',
      text: { nature: 'decret', number: '2019-1088' },
      raw: 'décret n°2019-1088',
      start: 0,
      end: 18,
    });
  });

  it('loi organique n° 2009-403 du 15 avril 2009 (case 9)', () => {
    expect(parseCitations('loi organique n° 2009-403 du 15 avril 2009')).toMatchObject([
      {
        kind: 'text',
        text: { nature: 'loi_organique', number: '2009-403', date: '2009-04-15' },
      },
    ]);
  });
});

describe('parseCitations — Cour de cassation', () => {
  const social = {
    kind: 'cass_decision',
    pourvoi: '22-12.345',
    chamber: 'social',
    date: '2024-03-12',
  };

  it('Cass. soc., 12 mars 2024, n° 22-12.345 (case 10)', () => {
    expect(parseCitations('Cass. soc., 12 mars 2024, n° 22-12.345')).toMatchObject([
      { ...social, raw: 'Cass. soc., 12 mars 2024, n° 22-12.345' },
    ]);
  });

  it('Soc., 12 mars 2024, n° 22-12.345 (case 11)', () => {
    expect(parseCitations('Soc., 12 mars 2024, n° 22-12.345')).toMatchObject([social]);
  });

  it('Cass. civ. 1re, 3 févr. 2021, pourvoi n° 19-21.403 (case 12)', () => {
    expect(parseCitations('Cass. civ. 1re, 3 févr. 2021, pourvoi n° 19-21.403')).toMatchObject([
      { kind: 'cass_decision', pourvoi: '19-21.403', chamber: 'civ1', date: '2021-02-03' },
    ]);
  });

  it.each([
    ['Cass. ass. plén., 17 nov. 2000, n° 99-13.701', '99-13.701', 'plenary', '2000-11-17'],
    ['Cass. com., 5 juin 2019, n° 17-22.192', '17-22.192', 'commercial', '2019-06-05'],
    ['Cass. crim., 1er sept. 2020, n° 19-85.123', '19-85.123', 'criminal', '2020-09-01'],
    ['Cass. ch. mixte, 24 févr. 2017, n° 15-20.411', '15-20.411', 'mixed', '2017-02-24'],
    ['Civ. 2e, 5 juin 2019, n° 17-22.192', '17-22.192', 'civ2', '2019-06-05'],
    ['Cass. 3e civ., 5 juin 2019, n° 17-22.192', '17-22.192', 'civ3', '2019-06-05'],
  ])('%s (cases 13–14)', (input, pourvoi, chamber, date) => {
    expect(parseCitations(input)).toMatchObject([
      { kind: 'cass_decision', pourvoi, chamber, date, raw: input },
    ]);
  });

  it('normalizes pourvoi 22-12345 to 22-12.345 (case 15)', () => {
    expect(parseCitations('Cass. soc., 12 mars 2024, n° 22-12345')).toMatchObject([social]);
  });

  it('omits chamber and date when absent', () => {
    const [citation] = parseCitations('Cass., n° 22-12.345');
    expect(citation).toEqual({
      kind: 'cass_decision',
      pourvoi: '22-12.345',
      raw: 'Cass., n° 22-12.345',
      start: 0,
      end: 19,
    });
  });
});

describe('parseCitations — ECLI and Conseil d’État', () => {
  it('ECLI:FR:CCASS:2024:SO00321 (case 16)', () => {
    expect(parseCitations('(ECLI:FR:CCASS:2024:SO00321).')).toMatchObject([
      { kind: 'ecli', ecli: 'ECLI:FR:CCASS:2024:SO00321', start: 1, end: 27 },
    ]);
  });

  it('CE, 10 oct. 2023, n° 463211 (case 17)', () => {
    expect(parseCitations('CE, 10 oct. 2023, n° 463211.')).toMatchObject([
      {
        kind: 'ce_decision',
        number: '463211',
        date: '2023-10-10',
        raw: 'CE, 10 oct. 2023, n° 463211',
      },
    ]);
  });
});

describe('parseCitations — French typography', () => {
  it('curly apostrophe, NBSP and NNBSP parse like plain ASCII and keep original spans', () => {
    const input = `l’article L.${NBSP}1234-1 du${NNBSP}Code du travail`;
    expect(parseCitations(input)).toMatchObject([
      {
        kind: 'code_article',
        article: 'L1234-1',
        code: 'Code du travail',
        raw: `article L.${NBSP}1234-1 du${NNBSP}Code du travail`,
      },
    ]);
  });

  it('en dash inside an article number', () => {
    expect(parseCitations('article L. 1234–1 du Code du travail')).toMatchObject([
      { kind: 'code_article', article: 'L1234-1', raw: 'article L. 1234–1 du Code du travail' },
    ]);
  });

  it('non-breaking hyphen (U+2011) inside an article number keeps the original raw', () => {
    const input = 'article L. 1234\u20111 du Code du travail';
    expect(parseCitations(input)).toMatchObject([
      { kind: 'code_article', article: 'L1234-1', code: 'Code du travail', raw: input },
    ]);
  });

  it('non-breaking hyphen (U+2011) in a code-first citation', () => {
    expect(parseCitations('C. trav., art. L. 1234\u20111')).toMatchObject([
      { kind: 'code_article', article: 'L1234-1', code: 'Code du travail' },
    ]);
  });

  it('non-breaking hyphen (U+2011) inside a pourvoi number', () => {
    expect(parseCitations('Cass. soc., 12 mars 2024, n° 22\u201112.345')).toMatchObject([
      { kind: 'cass_decision', pourvoi: '22-12.345', chamber: 'social', date: '2024-03-12' },
    ]);
  });

  it('modifier-letter apostrophe (U+02BC) before "article"', () => {
    expect(parseCitations('l\u02BCarticle 9 de la loi n° 78-17 du 6 janvier 1978')).toMatchObject([
      {
        kind: 'text_article',
        article: '9',
        text: { nature: 'loi', number: '78-17', date: '1978-01-06' },
      },
    ]);
  });

  it.each([
    'Cass. soc., 12 mars 2024, nº 22-12.345',
    'Cass. soc., 12 mars 2024, N° 22-12.345',
    `Cass. soc., 12${NBSP}mars${NBSP}2024, n°${NNBSP}22-12.345`,
  ])('%j → same as case 10', (input) => {
    expect(parseCitations(input)).toMatchObject([
      {
        kind: 'cass_decision',
        pourvoi: '22-12.345',
        chamber: 'social',
        date: '2024-03-12',
        raw: input,
      },
    ]);
  });
});

describe('parseCitations — no false positives (case 19)', () => {
  it.each([
    'Le 12 mars 2024, 3 salariés ont signé.',
    'voir l’article 1240',
    'article premier',
    'la loi est dure',
    'Société, 12 mars 2024, n° 22-12.345',
    'n° 22-12.345',
    'CEDH, 10 oct. 2023, n° 463211',
    'Vu le règlement CE n° 1346/2000',
    'le règlement CE n° 2201/2003',
    'Par une ordonnance du 3 mai 2023, le juge de la mise en état a rejeté la demande.',
    'l’article 3 de l’ordonnance du 3 mai 2023',
  ])('%j → []', (input) => {
    expect(parseCitations(input)).toEqual([]);
  });
});

describe('parseCitations — robustness', () => {
  it.each([
    'Cass.',
    'Cass. soc.,',
    'Soc.,',
    'Cass. soc., 12 mars 2024,',
    'CE, 10 oct. 2023,',
    'article 1',
    'C. civ.,',
    'C. civ., art. 1240',
    'CGI, art. 199 undecies',
    'la loi n°',
  ])('does not backtrack catastrophically on %j followed by a long whitespace run', (prefix) => {
    const startedAt = performance.now();
    expect(parseCitations(`${prefix}${' '.repeat(400)}x`)).toEqual([]);
    expect(performance.now() - startedAt).toBeLessThan(500);
  });
});

describe('parseCitations — mixed paragraph', () => {
  const paragraph = [
    `Selon l’article L. 1234-1 du Code du travail, et l’art. 1240 C. civ. ; voir C. trav., art. L1234-5.`,
    'Les articles 1240 et 1241 du Code civil, les articles L. 1234-1 à L. 1234-5 du Code du travail,',
    `l’article 9 de la loi n° 78-17 du 6 janvier 1978, l’ordonnance n° 2016-131 du 10${NBSP}février 2016,`,
    'le décret n°2019-1088 et la loi organique n° 2009-403 du 15 avril 2009.',
    'Jurisprudence : Cass. soc., 12 mars 2024, n° 22-12.345 ; Soc., 12 mars 2024, n° 22-12.345 ;',
    'Cass. civ. 1re, 3 févr. 2021, pourvoi n° 19-21.403 ; Cass. ass. plén., 17 nov. 2000, n° 99-13.701 ;',
    'Cass. com., 5 juin 2019, n° 17-22.192 ; Cass. crim., 1er sept. 2020, n° 19-85.123 ;',
    `Cass. ch. mixte, 24 févr. 2017, n° 15-20.411 ; Cass. soc., 12 mars 2024, nº${NNBSP}22-12345`,
    '(ECLI:FR:CCASS:2024:SO00321) ; CE, 10 oct. 2023, N° 463211.',
    'Le 12 mars 2024, 3 salariés ont signé ; voir l’article 1240 et l’article premier.',
  ].join('\n');

  const citations = parseCitations(paragraph);

  it('finds every citation, in order', () => {
    expect(citations.map((c) => c.kind)).toEqual([
      'code_article',
      'code_article',
      'code_article',
      'code_article',
      'code_article',
      'code_article',
      'code_article',
      'text_article',
      'text',
      'text',
      'text',
      'cass_decision',
      'cass_decision',
      'cass_decision',
      'cass_decision',
      'cass_decision',
      'cass_decision',
      'cass_decision',
      'cass_decision',
      'ecli',
      'ce_decision',
    ]);
  });

  it('is sorted by start', () => {
    const starts = citations.map((c) => c.start);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });

  it('spans index the original input exactly', () => {
    for (const c of citations) {
      expect(paragraph.slice(c.start, c.end)).toBe(c.raw);
    }
  });
});
