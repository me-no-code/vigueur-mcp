// Builders for the legifrance_get_text tests: text records as the service returns them, and
// answers built from them through the schema and the envelope.
import type {
  GetTextInput,
  GetTextResult,
  TextView,
} from '../../src/services/legislation/get-text.js';
import type { TextArticle, TextRecord, TextSection } from '../../src/services/legislation/ports.js';
import { toolAnswer } from '../../src/tools/envelope.js';
import {
  buildGetTextAnswer,
  type GetTextAnswerOptions,
} from '../../src/tools/legifrance/get-text-answer.js';
import { getTextOutput, SOURCE, TOOL } from '../../src/tools/legifrance/get-text-output.js';
import { type Answer, expectAnswer } from './answer.js';

export const TODAY = '2026-11-12';
export const NOW = new Date('2026-11-12T09:30:15.250Z');

export const withheld = (on: string) =>
  `(Text not shown: not in force on ${on}. Read it with an "at_date" inside its validity, or with legifrance_get_article and its id.)`;

export const article = (n: number, over: Partial<TextArticle> = {}): TextArticle => ({
  id: `LEGIARTI${String(n).padStart(12, '0')}`,
  num: String(n),
  status: 'in_force',
  rawStatus: 'VIGUEUR',
  validFrom: '2010-01-01',
  validTo: null,
  validToUndetermined: false,
  text: `Texte de l'article ${n}.`,
  ...over,
});

export const section = (
  cid: string,
  title: string,
  over: Partial<TextSection> = {},
): TextSection => ({
  id: cid,
  cid,
  title,
  status: 'in_force',
  validFrom: null,
  validTo: null,
  sections: [],
  articles: [],
  ...over,
});

export function record(over: Partial<TextRecord> = {}): TextRecord {
  return {
    id: 'LEGITEXT000000000001',
    cid: 'JORFTEXT000000000001',
    title: 'Loi n° 2010-1 du 1er janvier 2010 de test',
    nature: 'LOI',
    status: null,
    jurisState: 'Vigueur',
    nor: null,
    jorfLabel: null,
    publishedOn: '2010-01-02',
    signedOn: null,
    validFrom: null,
    validTo: null,
    visa: null,
    nota: null,
    sections: [],
    articles: [],
    ...over,
  };
}

/** A found text as the service builds it (no focus). */
export function foundText(r: TextRecord, warnings: string[] = []): GetTextResult {
  const flatArticles: TextView['flatArticles'] = r.articles.map((a) => ({ article: a, path: [] }));
  const walk = (ss: TextSection[], parents: string[]) => {
    for (const s of ss) {
      const path = [...parents, s.title];
      for (const a of s.articles) flatArticles.push({ article: a, path });
      walk(s.sections, path);
    }
  };
  walk(r.sections, []);
  return {
    kind: 'found',
    text: {
      record: r,
      asOf: TODAY,
      url: `https://www.legifrance.gouv.fr/loda/id/${r.id}`,
      focus: null,
      flatArticles,
      warnings,
    },
  };
}

export const LOI_2010_1: GetTextInput = { nature: 'loi', number: '2010-1' };
export const DECRET_2000_1: GetTextInput = { nature: 'decret', number: '2000-1' };
export const REQUEST = {
  tool: TOOL,
  nature: 'loi',
  number: '2010-1',
  at_date: TODAY,
  part: 'outline',
  page: 1,
};

export function answer(
  r: GetTextResult,
  outcome: string,
  opts: Partial<GetTextAnswerOptions> = {},
): Answer {
  return expectAnswer(
    toolAnswer(
      getTextOutput,
      buildGetTextAnswer(r, {
        request: REQUEST,
        part: 'outline',
        page: 1,
        input: LOI_2010_1,
        today: TODAY,
        ...opts,
      }),
      { now: () => NOW },
    ),
    { source: SOURCE, outcome },
  );
}

export const outlineOf = (r: GetTextResult, page = 1) => answer(r, 'found', { page });
export const articlesOf = (r: GetTextResult, page = 1) =>
  answer(r, 'found', { part: 'articles', page });
