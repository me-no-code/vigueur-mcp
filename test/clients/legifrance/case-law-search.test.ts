import { describe, expect, it } from 'vitest';
import { createLegifranceCaseLawClient } from '../../../src/clients/legifrance/case-law.js';
import type { CaseLawCollection } from '../../../src/domain/decisions.js';
import type { CaseLawQuery } from '../../../src/services/case-law/ports.js';
import { VigueurError } from '../../../src/shared/errors.js';
import { fakePisteHttp } from '../../helpers/fake-piste-http.js';

const base: CaseLawQuery = { collection: 'judicial', sort: 'relevance', page: 1, pageSize: 10 };

function setup(fixture = '121-search-juri-all-date-desc') {
  const fake = fakePisteHttp([{ path: '/search', fixture }]);
  return { repo: createLegifranceCaseLawClient(fake.http), calls: fake.calls };
}

const bodyOf = (calls: ReturnType<typeof setup>['calls']) =>
  calls[0]?.req.body as {
    fond: string;
    recherche: {
      champs: unknown[];
      filtres?: unknown[];
      sort: string;
      typePagination: string;
      pageNumber: number;
      pageSize: number;
      operateur: string;
    };
  };

const champ = (typeChamp: string, typeRecherche: string, valeur: string) => ({
  typeChamp,
  criteres: [{ typeRecherche, valeur, operateur: 'ET' }],
  operateur: 'ET',
});

describe('searchCaseLaw request', () => {
  it('asks the CNIL fond for the newest decisions in a date range', async () => {
    const { repo, calls } = setup('128-search-cnil-all-date-decision-desc');
    await repo.searchCaseLaw({
      ...base,
      collection: 'cnil',
      sort: 'newest',
      dateFrom: '2026-03-01',
      dateTo: '2026-03-31',
    });
    expect(bodyOf(calls)).toEqual({
      fond: 'CNIL',
      recherche: {
        champs: [champ('ALL', 'UN_DES_MOTS', '*')],
        filtres: [{ facette: 'DATE_DELIB', dates: { start: '2026-03-01', end: '2026-03-31' } }],
        pageNumber: 1,
        pageSize: 10,
        operateur: 'ET',
        sort: 'DATE_DECISION_DESC',
        typePagination: 'DEFAUT',
      },
    });
  });

  it('fills a missing date bound with the open interval', async () => {
    const { repo, calls } = setup();
    await repo.searchCaseLaw({ ...base, dateFrom: '2026-01-01' });
    await repo.searchCaseLaw({ ...base, dateTo: '2026-01-31' });
    expect(bodyOf(calls).recherche.filtres).toEqual([
      { facette: 'DATE_DECISION', dates: { start: '2026-01-01', end: '2999-01-01' } },
    ]);
    expect(calls[1]?.req.body).toMatchObject({
      recherche: {
        filtres: [{ facette: 'DATE_DECISION', dates: { start: '1800-01-01', end: '2026-01-31' } }],
      },
    });
  });

  it('searches a pourvoi number exactly on NUM_AFFAIRE', async () => {
    const { repo, calls } = setup('131-search-juri-num-affaire-2416924');
    await repo.searchCaseLaw({ ...base, number: '24-16.924' });
    expect(bodyOf(calls).fond).toBe('JURI');
    expect(bodyOf(calls).recherche.champs).toEqual([champ('NUM_AFFAIRE', 'EXACTE', '24-16.924')]);
    expect(bodyOf(calls).recherche.filtres).toBeUndefined();
  });

  it('searches an ECLI on the ECLI field', async () => {
    const { repo, calls } = setup('136-search-cetat-champ-ecli');
    await repo.searchCaseLaw({
      ...base,
      collection: 'administrative',
      ecli: 'ECLI:FR:CEORD:2026:519801.20261006',
    });
    expect(bodyOf(calls).fond).toBe('CETAT');
    expect(bodyOf(calls).recherche.champs).toEqual([
      champ('ECLI', 'EXACTE', 'ECLI:FR:CEORD:2026:519801.20261006'),
    ]);
  });

  it("uses each collection's number field", async () => {
    const fields: [CaseLawCollection, string, string][] = [
      ['judicial', 'JURI', 'NUM_AFFAIRE'],
      ['administrative', 'CETAT', 'NUM_DEC'],
      ['constitutional', 'CONSTIT', 'NUM_DEC'],
      ['cnil', 'CNIL', 'NUM_DELIB'],
      ['financial', 'JUFI', 'NUM_DEC'],
    ];
    for (const [collection, fond, field] of fields) {
      const { repo, calls } = setup();
      await repo.searchCaseLaw({ ...base, collection, number: '2026-1' });
      expect(bodyOf(calls).fond).toBe(fond);
      expect(bodyOf(calls).recherche.champs).toEqual([champ(field, 'EXACTE', '2026-1')]);
    }
  });

  it('searches all the words of a text in any field', async () => {
    const { repo, calls } = setup();
    await repo.searchCaseLaw({ ...base, text: ' forfait jours ' });
    expect(bodyOf(calls).recherche.champs).toEqual([
      champ('ALL', 'TOUS_LES_MOTS_DANS_UN_CHAMP', 'forfait jours'),
    ]);
    expect(bodyOf(calls).recherche.sort).toBe('PERTINENCE');
  });

  it('matches everything when no criterion is given', async () => {
    const { repo, calls } = setup();
    await repo.searchCaseLaw({ ...base, page: 3, pageSize: 25 });
    expect(bodyOf(calls).recherche).toMatchObject({
      champs: [champ('ALL', 'UN_DES_MOTS', '*')],
      pageNumber: 3,
      pageSize: 25,
      typePagination: 'DEFAUT',
    });
  });

  it('maps the sorts of each collection', async () => {
    const sorts: [CaseLawCollection, 'newest' | 'relevance', string][] = [
      ['judicial', 'newest', 'DATE_DESC'],
      ['administrative', 'newest', 'DATE_DESC'],
      ['financial', 'newest', 'DATE_DESC'],
      ['cnil', 'newest', 'DATE_DECISION_DESC'],
      ['cnil', 'relevance', 'PERTINENCE'],
      ['financial', 'relevance', 'PERTINENCE'],
      ['constitutional', 'relevance', 'PERTINENCE'],
    ];
    for (const [collection, sort, wire] of sorts) {
      const { repo, calls } = setup();
      await repo.searchCaseLaw({ ...base, collection, sort });
      expect(bodyOf(calls).recherche.sort).toBe(wire);
    }
  });

  it('filters the court, the chamber and the publication of a judicial search', async () => {
    const { repo, calls } = setup();
    await repo.searchCaseLaw({
      ...base,
      court: 'cassation',
      chamber: 'social',
      publication: 'published',
      dateFrom: '2026-01-01',
      dateTo: '2026-06-30',
    });
    expect(bodyOf(calls).recherche.filtres).toEqual([
      { facette: 'JURIDICTION_JUDICIAIRE', valeurs: ['Cour de cassation'] },
      { facette: 'CASSATION_FORMATION', valeurs: ['CHAMBRE_SOCIALE'] },
      { facette: 'CASSATION_TYPE_PUBLICATION_BULLETIN', valeurs: ['T'] },
      { facette: 'DATE_DECISION', dates: { start: '2026-01-01', end: '2026-06-30' } },
    ]);
  });

  it('maps every court and chamber to its wire value', async () => {
    const courts = {
      cassation: 'Cour de cassation',
      appeal: "Juridictions d'appel",
      first_instance: 'Juridictions du premier degré',
    } as const;
    for (const [court, wire] of Object.entries(courts)) {
      const { repo, calls } = setup();
      await repo.searchCaseLaw({ ...base, court: court as keyof typeof courts });
      expect(bodyOf(calls).recherche.filtres).toEqual([
        { facette: 'JURIDICTION_JUDICIAIRE', valeurs: [wire] },
      ]);
    }
    const chambers = {
      plenary: 'ASSEMBLEE_PLENIERE',
      mixed: 'CHAMBRE_MIXTE',
      civ1: 'CHAMBRE_CIVILE_1',
      civ2: 'CHAMBRE_CIVILE_2',
      civ3: 'CHAMBRE_CIVILE_3',
      commercial: 'CHAMBRE_COMMERCIALE',
      social: 'CHAMBRE_SOCIALE',
      criminal: 'CHAMBRE_CRIMINELLE',
    } as const;
    for (const [chamber, wire] of Object.entries(chambers)) {
      const { repo, calls } = setup();
      await repo.searchCaseLaw({ ...base, chamber: chamber as keyof typeof chambers });
      expect(bodyOf(calls).recherche.filtres).toEqual([
        { facette: 'CASSATION_FORMATION', valeurs: [wire] },
      ]);
    }
  });

  it('filters the publication of each collection that has one', async () => {
    const cases: [CaseLawCollection, 'published' | 'unpublished', unknown][] = [
      [
        'judicial',
        'unpublished',
        { facette: 'CASSATION_TYPE_PUBLICATION_BULLETIN', valeurs: ['F'] },
      ],
      ['administrative', 'published', { facette: 'PUBLICATION_RECUEIL', valeurs: ['PUBLIE'] }],
      [
        'administrative',
        'unpublished',
        { facette: 'PUBLICATION_RECUEIL', valeurs: ['NON_PUBLIE'] },
      ],
      ['financial', 'published', { facette: 'PUBLICATION_RECUEIL', valeurs: ['PUBLIE'] }],
    ];
    for (const [collection, publication, filter] of cases) {
      const { repo, calls } = setup();
      await repo.searchCaseLaw({ ...base, collection, publication });
      expect(bodyOf(calls).recherche.filtres).toEqual([filter]);
    }
  });

  it('never sends the JURIDICTION_NATURE facet, whatever the collection', async () => {
    const collections: CaseLawCollection[] = [
      'judicial',
      'administrative',
      'constitutional',
      'cnil',
      'financial',
    ];
    for (const collection of collections) {
      const { repo, calls } = setup();
      await repo.searchCaseLaw({
        ...base,
        collection,
        text: 'x',
        dateFrom: '2026-01-01',
        dateTo: '2026-02-01',
      });
      expect(JSON.stringify(bodyOf(calls))).not.toContain('JURIDICTION_NATURE');
    }
  });

  it('rejects refinements a collection does not offer, without calling Légifrance', async () => {
    const rejected: Partial<CaseLawQuery>[] = [
      { collection: 'administrative', court: 'cassation' },
      { collection: 'cnil', chamber: 'social' },
      { collection: 'constitutional', publication: 'published' },
      { collection: 'cnil', publication: 'published' },
      { collection: 'constitutional', ecli: 'ECLI:FR:CC:2026:2026.1' },
      { collection: 'financial', ecli: 'ECLI:FR:CC:2026:2026.1' },
      { pageSize: 0 },
      { pageSize: 101 },
      { page: 0 },
    ];
    for (const partial of rejected) {
      const { repo, calls } = setup();
      await expect(repo.searchCaseLaw({ ...base, ...partial })).rejects.toBeInstanceOf(
        VigueurError,
      );
      expect(calls).toHaveLength(0);
    }
  });

  it('threads the abort signal to the HTTP call', async () => {
    const { repo, calls } = setup();
    const signal = new AbortController().signal;
    await repo.searchCaseLaw(base, { signal });
    expect(calls[0]?.opts?.signal).toBe(signal);
  });
});

describe('searchCaseLaw mapping', () => {
  it('maps a Cour de cassation judgment', async () => {
    const { repo } = setup('121-search-juri-all-date-desc');
    const page = await repo.searchCaseLaw({ ...base, pageSize: 10 });
    expect(page.total).toBe(606350);
    expect(page.page).toBe(1);
    expect(page.pageSize).toBe(10);
    expect(page.hits).toHaveLength(10);
    expect(page.hits[0]).toEqual({
      id: 'JURITEXT000054929450',
      collection: 'judicial',
      title:
        'Cour de cassation, civile, Chambre civile 2, 17 septembre 2026, 24-21.177, Publié au bulletin',
      court: 'Cour de cassation',
      chamber: 'Chambre civile 2',
      nature: 'arret',
      decisionDate: '2026-09-17',
      numbers: ['24-21.177'],
      publication: 'Publié au bulletin',
      solution: 'Cassation',
      snippet: null,
    });
  });

  it('maps a Conseil constitutionnel decision, taking the outcome from the hit only', async () => {
    const { repo } = setup('127-search-constit-all-date-desc');
    const page = await repo.searchCaseLaw({ ...base, collection: 'constitutional' });
    expect(page.hits[0]).toMatchObject({
      id: 'CONSTEXT000054998620',
      collection: 'constitutional',
      court: 'Conseil constitutionnel',
      nature: 'qpc',
      solution: 'Conformité',
      numbers: ['2026-1226'],
      decisionDate: '2026-10-16',
    });
  });

  it('maps an opinion of the Cour de cassation', async () => {
    const { repo } = setup('124-search-juri-avis-ordonnance');
    const page = await repo.searchCaseLaw(base);
    expect(page.hits[0]).toMatchObject({
      id: 'JURITEXT000052304015',
      chamber: 'Cour de cassation saisie pour avis',
      nature: 'avis',
      solution: 'Avis sur saisine',
    });
  });

  it("maps Conseil d'État, CNIL and Cour des comptes hits", async () => {
    const admin = await setup('125-search-cetat-all-date-desc').repo.searchCaseLaw({
      ...base,
      collection: 'administrative',
    });
    expect(admin.hits[0]).toMatchObject({
      id: 'CETATEXT000055079044',
      court: 'CAA de BORDEAUX',
      numbers: ['24BX01296'],
      decisionDate: '2026-11-10',
      solution: null,
    });
    const cnil = await setup('128-search-cnil-all-date-decision-desc').repo.searchCaseLaw({
      ...base,
      collection: 'cnil',
    });
    expect(cnil.hits[0]).toMatchObject({
      id: 'CNILTEXT000055065700',
      nature: 'deliberation',
      numbers: ['2026-121'],
      decisionDate: '2026-11-05',
    });
    const financial = await setup('129-search-jufi-all-date-desc').repo.searchCaseLaw({
      ...base,
      collection: 'financial',
    });
    expect(financial.hits[0]).toMatchObject({
      id: 'JUFITEXT000055019898',
      chamber: 'CHAMBRE DU CONTENTIEUX',
      numbers: ['S-2026-1144'],
      decisionDate: '2026-10-22',
    });
  });

  it('finds one CNIL deliberation and one Cour des comptes judgment by number', async () => {
    const cnil = await setup('140-search-cnil-num-delib-2026-023').repo.searchCaseLaw({
      ...base,
      collection: 'cnil',
    });
    expect(cnil.hits[0]).toMatchObject({
      id: 'CNILTEXT000053716494',
      numbers: ['2026-023'],
      decisionDate: '2026-03-12',
    });
    const financial = await setup('141-search-jufi-num-dec-S-2026-1111').repo.searchCaseLaw({
      ...base,
      collection: 'financial',
    });
    expect(financial.hits[0]).toMatchObject({
      id: 'JUFITEXT000055005642',
      numbers: ['S-2026-1111'],
      decisionDate: '2026-10-16',
    });
  });

  it('finds one judgment by pourvoi number or ECLI', async () => {
    for (const fixture of ['131-search-juri-num-affaire-2416924', '134-search-juri-champ-ecli']) {
      const page = await setup(fixture).repo.searchCaseLaw(base);
      expect(page.total).toBe(1);
      expect(page.hits[0]?.id).toBe('JURITEXT000053197030');
      expect(page.hits[0]?.numbers).toEqual(['24-16.924']);
    }
  });

  it('keeps the raw title and leaves the parsed fields empty when the title is not recognised', async () => {
    const fake = fakePisteHttp([
      {
        path: '/search',
        reply: {
          totalResultNumber: 1,
          results: [
            {
              titles: [{ id: 'JURITEXT000000000001', title: 'Some  <mark>odd</mark> title' }],
              nature: 'arret',
              solution: null,
              text: 'un <mark>extrait</mark>\n  de   texte',
            },
          ],
        },
      },
    ]);
    const page = await createLegifranceCaseLawClient(fake.http).searchCaseLaw(base);
    expect(page.hits[0]).toEqual({
      id: 'JURITEXT000000000001',
      collection: 'judicial',
      title: 'Some odd title',
      court: null,
      chamber: null,
      nature: 'arret',
      decisionDate: null,
      numbers: [],
      publication: null,
      solution: null,
      snippet: 'un extrait de texte',
    });
  });

  it('cuts a long snippet to 300 characters', async () => {
    const fake = fakePisteHttp([
      {
        path: '/search',
        reply: {
          totalResultNumber: 1,
          results: [
            { titles: [{ id: 'JURITEXT000000000001', title: 'x' }], text: 'mot '.repeat(200) },
          ],
        },
      },
    ]);
    const page = await createLegifranceCaseLawClient(fake.http).searchCaseLaw(base);
    expect(page.hits[0]?.snippet?.length).toBeLessThanOrEqual(300);
  });

  it('reports a hit whose id is not a decision id as an unexpected response', async () => {
    const fake = fakePisteHttp([
      {
        path: '/search',
        reply: { totalResultNumber: 1, results: [{ titles: [{ id: 'JURITEXT1', title: 'x' }] }] },
      },
    ]);
    await expect(
      createLegifranceCaseLawClient(fake.http).searchCaseLaw(base),
    ).rejects.toMatchObject({ kind: 'unexpected_response', details: { source: 'legifrance' } });
  });

  it('reports a body without a total as an unexpected response', async () => {
    const fake = fakePisteHttp([{ path: '/search', reply: { results: [] } }]);
    await expect(
      createLegifranceCaseLawClient(fake.http).searchCaseLaw(base),
    ).rejects.toMatchObject({ kind: 'unexpected_response' });
  });

  it('maps an old dot-separated Cour des comptes title (fixture 154)', async () => {
    const { repo } = setup('154-search-jufi-filter-recueil-publie-pertinence');
    const page = await repo.searchCaseLaw({ ...base, collection: 'financial' });
    expect(page.hits[0]).toMatchObject({ court: 'Cour des comptes', decisionDate: '2010-05-06' });
  });

  it('shows the snippet of a highlighted hit without its marks (fixture 34)', async () => {
    const { repo } = setup('34-search-juri-fulltext');
    const hit = (await repo.searchCaseLaw(base)).hits[0];
    expect(hit?.id).toBe('JURITEXT000053197030');
    expect(hit?.snippet).toContain('faute grave');
    expect(hit?.snippet).not.toContain('<mark');
    expect(hit?.snippet?.length).toBeLessThanOrEqual(300);
  });
});
