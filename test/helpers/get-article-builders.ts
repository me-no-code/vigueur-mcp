// Builders for the legifrance_get_article tests: article views as the service returns them, and
// the services object a Légifrance source is created from.
import type { ArticleView, GetArticleResult } from '../../src/services/legislation/get-article.js';
import { TOOL } from '../../src/tools/legifrance/get-article-output.js';
import type { LegifranceServices } from '../../src/tools/legifrance/index.js';

export const link = (id: string) => `https://www.legifrance.gouv.fr/codes/article_lc/${id}`;

export const TODAY = '2026-11-12';
export const NOW = new Date('2026-11-12T09:30:15.250Z');

export function fakeServices(getArticle: LegifranceServices['getArticle']): LegifranceServices {
  const unused = () => Promise.reject(new Error('not used in these tests'));
  return {
    getArticle,
    getArticleHistory: unused,
    searchLegislation: unused,
    listChanges: unused,
    getText: unused,
    browseCode: unused,
    latestJo: unused,
    listReferenceValues: unused,
    searchCaseLaw: unused,
    getDecision: unused,
  };
}

export function view(over: Partial<ArticleView> = {}, text = 'Texte officiel.'): ArticleView {
  return {
    record: {
      version: {
        id: 'LEGIARTI000000000001',
        number: '7',
        text,
        status: 'in_force',
        rawStatus: 'VIGUEUR',
        validFrom: '2010-01-01',
        validTo: null,
      },
      cid: 'LEGIARTI000000000001',
      textId: 'LEGITEXT000006070721',
      textTitle: 'Code civil',
      nota: null,
      sectionPath: [],
      sectionCid: null,
      versions: [],
      modifications: [],
      citationsCount: 0,
    },
    asOf: TODAY,
    statusAt: { inForce: true, reason: 'in_force', from: '2010-01-01', until: null },
    warnings: [],
    url: link('LEGIARTI000000000001'),
    relocation: null,
    ...over,
  };
}

export const found = (over?: Partial<ArticleView>, text?: string): GetArticleResult => ({
  kind: 'found',
  article: view(over, text),
});

/** The request echo of `{ number: '7' }` with every default applied. */

export const REQUEST = {
  tool: TOOL,
  number: '7',
  at_date: TODAY,
  response_format: 'concise',
  offset: 0,
  include_neighbours: false,
};
