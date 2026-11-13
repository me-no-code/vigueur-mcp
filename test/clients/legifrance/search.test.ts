import { describe, expect, it } from 'vitest';
import { createLegifranceClient } from '../../../src/clients/legifrance/client.js';
import type { LegislationQuery } from '../../../src/services/legislation/ports.js';
import { VigueurError } from '../../../src/shared/errors.js';
import { fakePisteHttp } from '../../helpers/fake-piste-http.js';

const base: LegislationQuery = {
  collection: 'codes',
  atDate: '2026-11-12',
  includeHistorical: false,
  page: 1,
  pageSize: 20,
};

function setup(fixture: string) {
  const fake = fakePisteHttp([{ path: '/search', fixture }]);
  return { repo: createLegifranceClient(fake.http), calls: fake.calls };
}

const bodyOf = (calls: ReturnType<typeof setup>['calls']) => calls[0]?.req.body;

const champ = (typeChamp: string, typeRecherche: string, valeur: string) => ({
  typeChamp,
  criteres: [{ typeRecherche, valeur, operateur: 'ET' }],
  operateur: 'ET',
});

describe('searchLegislation request', () => {
  it('searches an in-force code by article number on a date', async () => {
    const { repo, calls } = setup('02-search-code-date-1240-today');
    await repo.searchLegislation({ ...base, codeTitle: 'Code civil', articleNumber: '1240' });
    expect(bodyOf(calls)).toEqual({
      fond: 'CODE_DATE',
      recherche: {
        champs: [champ('NUM_ARTICLE', 'EXACTE', '1240')],
        filtres: [
          { facette: 'NOM_CODE', valeurs: ['Code civil'] },
          { facette: 'DATE_VERSION', singleDate: '2026-11-12' },
        ],
        pageNumber: 1,
        pageSize: 20,
        operateur: 'ET',
        sort: 'PERTINENCE',
        typePagination: 'ARTICLE',
      },
    });
  });

  it('searches every version of a code with no status facet', async () => {
    const { repo, calls } = setup('05-search-code-etat-fulltext');
    await repo.searchLegislation({
      ...base,
      includeHistorical: true,
      codeTitle: 'Code civil',
      text: 'cause à autrui un dommage',
    });
    expect(bodyOf(calls)).toMatchObject({
      fond: 'CODE_ETAT',
      recherche: {
        champs: [champ('ALL', 'TOUS_LES_MOTS_DANS_UN_CHAMP', 'cause à autrui un dommage')],
        filtres: [{ facette: 'TEXT_NOM_CODE', valeurs: ['Code civil'] }],
      },
    });
  });

  it('sends both champs when text and article number are given', async () => {
    const { repo, calls } = setup('02-search-code-date-1240-today');
    await repo.searchLegislation({ ...base, text: 'dommage', articleNumber: '1240' });
    const champs = (bodyOf(calls) as { recherche: { champs: unknown[] } }).recherche.champs;
    expect(champs).toEqual([
      champ('ALL', 'TOUS_LES_MOTS_DANS_UN_CHAMP', 'dommage'),
      champ('NUM_ARTICLE', 'EXACTE', '1240'),
    ]);
  });

  it('finds a loda text by number on a date', async () => {
    const { repo, calls } = setup('30-search-loda-date-num-78-17');
    const page = await repo.searchLegislation({ ...base, collection: 'loda', textNumber: '78-17' });
    expect(bodyOf(calls)).toMatchObject({
      fond: 'LODA_DATE',
      recherche: {
        champs: [champ('NUM', 'EXACTE', '78-17')],
        filtres: [{ facette: 'DATE_VERSION', singleDate: '2026-11-12' }],
        typePagination: 'DEFAUT',
      },
    });
    expect(page.total).toBe(1);
    expect(page.hits[0]).toMatchObject({
      kind: 'text',
      textId: 'LEGITEXT000006068624',
      id: 'LEGITEXT000006068624',
      status: 'in_force',
      nature: 'LOI',
    });
  });

  it('uses the historical loda fond with the nature facet', async () => {
    const { repo, calls } = setup('31-search-loda-etat-fulltext-vigueur');
    await repo.searchLegislation({
      ...base,
      collection: 'loda',
      includeHistorical: true,
      text: 'intelligence artificielle',
      nature: 'DECRET',
    });
    expect(bodyOf(calls)).toMatchObject({
      fond: 'LODA_ETAT',
      recherche: { filtres: [{ facette: 'TEXT_NATURE', valeurs: ['DECRET'] }] },
    });
  });

  it('finds a jorf text by NOR', async () => {
    const { repo, calls } = setup('84-search-jorf-by-nor');
    const page = await repo.searchLegislation({ ...base, collection: 'jorf', nor: 'JUSC1522466R' });
    expect(bodyOf(calls)).toMatchObject({
      fond: 'JORF',
      recherche: {
        champs: [champ('NOR', 'EXACTE', 'JUSC1522466R')],
        filtres: [],
        sort: 'PUBLICATION_DATE_DESC',
      },
    });
    expect(page.hits).toHaveLength(1);
    expect(page.hits[0]).toMatchObject({
      kind: 'text',
      id: 'JORFTEXT000032004939',
      nor: 'JUSC1522466R',
      publishedOn: '2016-02-11',
    });
  });

  it('filters jorf by nature and publication dates', async () => {
    const { repo, calls } = setup('32-search-jorf-recent');
    const page = await repo.searchLegislation({
      ...base,
      collection: 'jorf',
      text: 'travail',
      nature: 'ARRETE',
      publishedFrom: '2026-10-01',
      publishedTo: '2026-11-12',
    });
    expect(bodyOf(calls)).toMatchObject({
      recherche: {
        filtres: [
          { facette: 'NATURE', valeurs: ['ARRETE'] },
          { facette: 'DATE_PUBLICATION', dates: { start: '2026-10-01', end: '2026-11-12' } },
        ],
      },
    });
    expect(page.total).toBe(71);
    expect(page.hits[0]?.title).not.toContain('<mark>');
  });

  it('searches kali by IDCC restricted to in-force texts', async () => {
    const { repo, calls } = setup('33-search-kali-idcc-1486');
    const page = await repo.searchLegislation({ ...base, collection: 'kali', idcc: '1486' });
    expect(bodyOf(calls)).toMatchObject({
      fond: 'KALI',
      recherche: {
        champs: [champ('IDCC', 'EXACTE', '1486')],
        filtres: [
          {
            facette: 'LEGAL_STATUS',
            valeurs: ['VIGUEUR', 'VIGUEUR_ETEN', 'VIGUEUR_NON_ETEN'],
          },
        ],
      },
    });
    expect(page.total).toBe(176);
    expect(page.hits[0]).toMatchObject({ kind: 'text', id: 'KALITEXT000052119023' });
  });

  it('drops the kali status facet when historical', async () => {
    const { repo, calls } = setup('33-search-kali-idcc-1486');
    await repo.searchLegislation({
      ...base,
      collection: 'kali',
      idcc: '1486',
      includeHistorical: true,
    });
    expect(bodyOf(calls)).toMatchObject({ recherche: { filtres: [] } });
  });

  it('forwards the abort signal', async () => {
    const { repo, calls } = setup('84-search-jorf-by-nor');
    const signal = new AbortController().signal;
    await repo.searchLegislation({ ...base, collection: 'jorf', nor: 'X' }, { signal });
    expect(calls[0]?.opts?.signal).toBe(signal);
  });
});

describe('searchLegislation mapping', () => {
  it('maps an article extract', async () => {
    const { repo } = setup('02-search-code-date-1240-today');
    const page = await repo.searchLegislation({ ...base, articleNumber: '1240' });
    expect(page).toMatchObject({ total: 1, page: 1, pageSize: 20 });
    expect(page.hits[0]).toMatchObject({
      kind: 'article',
      articleNumber: '1240',
      id: 'LEGIARTI000032041571',
      textId: 'LEGITEXT000006070721',
      title: 'Code civil',
      status: 'in_force',
      rawStatus: 'VIGUEUR',
      validFrom: '2016-10-01',
      validTo: null,
    });
  });

  it('keeps only extracts whose number matches the requested one, ignoring case and spacing', async () => {
    const { repo } = setup('60-search-code-etat-pagesize100');
    const page = await repo.searchLegislation({
      ...base,
      includeHistorical: true,
      articleNumber: ' l1234-5 ',
    });
    expect(page.hits).toHaveLength(1);
    expect(page.hits[0]?.articleNumber).toBe('L1234-5');
  });

  it('strips highlight tags and id suffixes everywhere', async () => {
    const { repo } = setup('60-search-code-etat-pagesize100');
    const page = await repo.searchLegislation({
      ...base,
      includeHistorical: true,
      text: 'préavis',
    });
    expect(page.total).toBe(90);
    expect(page.hits.length).toBe(90);
    for (const h of page.hits) {
      expect(h.title).not.toContain('<mark>');
      expect(h.snippet ?? '').not.toContain('<mark>');
      expect(h.id).not.toMatch(/_\d{2}-\d{2}-\d{4}$/);
      expect(h.textId).not.toMatch(/_\d{2}-\d{2}-\d{4}$/);
    }
    expect(page.hits[0]?.snippet).toContain('préavis');
  });

  it('maps loda extracts to article hits under their text', async () => {
    const { repo } = setup('31-search-loda-etat-fulltext-vigueur');
    const page = await repo.searchLegislation({
      ...base,
      collection: 'loda',
      includeHistorical: true,
      text: 'intelligence artificielle',
    });
    expect(page.hits[0]).toMatchObject({
      kind: 'article',
      id: 'LEGIARTI000054776625',
      textId: 'LEGITEXT000054776608',
      articleNumber: 'Annexe I',
      nor: 'TRSD2618378D',
    });
  });

  it('reports a malformed body as an unexpected response', async () => {
    const fake = fakePisteHttp([
      { path: '/search', reply: { results: [{ titles: [] }], totalResultNumber: 1 } },
    ]);
    const repo = createLegifranceClient(fake.http);
    await expect(
      repo.searchLegislation({ ...base, collection: 'jorf', text: 'x' }),
    ).rejects.toMatchObject({ kind: 'upstream_unavailable' });
  });
});

describe('searchLegislation validation', () => {
  async function invalid(q: LegislationQuery, message?: string) {
    const { repo, calls } = setup('84-search-jorf-by-nor');
    const err = await repo.searchLegislation(q).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(VigueurError);
    expect((err as VigueurError).kind).toBe('invalid_input');
    if (message !== undefined) expect((err as VigueurError).message).toBe(message);
    expect(calls).toHaveLength(0);
  }

  // Messages name the tool parameters (query, article_number, code, page_size…).
  it('rejects a page size above 100', () =>
    invalid(
      { ...base, text: 'x', pageSize: 101 },
      '"page_size" must be a whole number from 1 to 100.',
    ));
  it('rejects a page size of 0', () => invalid({ ...base, text: 'x', pageSize: 0 }));
  it('rejects a page below 1', () =>
    invalid({ ...base, text: 'x', page: 0 }, '"page" must be a whole number from 1.'));
  it('rejects a query with no criterion', () =>
    invalid(
      { ...base, codeTitle: 'Code civil' },
      'Give at least one of "query", "article_number", "text_number", "nor" or "idcc": "code", "nature" and the publication dates only narrow a search.',
    ));
  it('rejects a blank criterion', () => invalid({ ...base, text: '   ' }));
  it('rejects a criterion the collection cannot search', () =>
    invalid(
      { ...base, collection: 'kali', nor: 'X' },
      '"nor" does not apply to the kali collection.',
    ));
  it('names a refinement by its tool parameter', () =>
    invalid(
      { ...base, collection: 'kali', idcc: '1486', codeTitle: 'Code civil' },
      '"code" does not apply to the kali collection.',
    ));
  it('names an article number by its tool parameter', () =>
    invalid(
      { ...base, collection: 'kali', text: 'x', articleNumber: '1' },
      '"article_number" does not apply to the kali collection.',
    ));
});
