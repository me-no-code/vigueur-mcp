import { describe, expect, it } from 'vitest';
import { createLegifranceClient } from '../../../src/clients/legifrance/client.js';
import type { LegislationRepository } from '../../../src/services/legislation/ports.js';
import { VigueurError } from '../../../src/shared/errors.js';
import { type FakeRoute, fakePisteHttp } from '../../helpers/fake-piste-http.js';

function client(routes: FakeRoute[], opts?: Parameters<typeof createLegifranceClient>[1]) {
  const fake = fakePisteHttp(routes);
  return { repo: createLegifranceClient(fake.http, opts), calls: fake.calls };
}

const serve = (path: string, fixture: string): FakeRoute => ({ path, fixture });
const reply = (path: string, body: unknown): FakeRoute => ({ path, reply: body });

async function rejection(p: Promise<unknown>): Promise<VigueurError> {
  const err = await p.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(VigueurError);
  return err as VigueurError;
}

const DAY_MS = 86_400_000;
/** Epoch ms of a UTC date, as `getArticle` sends them. */
const ms = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

/** A minimal `getArticle` payload; `over` replaces fields. */
function article(over: Record<string, unknown> = {}) {
  return {
    executionTime: 0,
    dereferenced: false,
    article: {
      id: 'LEGIARTI000000000001',
      cid: 'LEGIARTI000000000001',
      num: '1',
      etat: 'VIGUEUR',
      dateDebut: ms('2008-05-01'),
      dateFin: ms('2999-01-01'),
      texte: 'Texte.',
      texteHtml: '<p>Texte.</p>',
      ...over,
    },
  };
}

describe('listCodes', () => {
  it('maps /list/code (fixture 68)', async () => {
    const { repo, calls } = client([serve('/list/code', '68-list-code-pagesize200')]);
    const codes = await repo.listCodes();
    expect(codes).toHaveLength(108);
    expect(codes).toContainEqual({
      id: 'LEGITEXT000006070721',
      title: 'Code civil',
      status: 'in_force',
    });
    expect(codes).toContainEqual({
      id: 'LEGITEXT000006074947',
      title: 'Code de la route (ancien)',
      status: 'repealed',
    });
    expect(calls.map((c) => c.req)).toEqual([
      { method: 'POST', path: '/list/code', body: { pageNumber: 1, pageSize: 200 } },
    ]);
  });

  it('caches the list for codesTtlMs', async () => {
    let t = 1_000_000;
    const { repo, calls } = client([serve('/list/code', '68-list-code-pagesize200')], {
      now: () => new Date(t),
      codesTtlMs: 60_000,
    });
    await repo.listCodes();
    t += 59_999;
    await repo.listCodes();
    expect(calls).toHaveLength(1);
    t += 1;
    await repo.listCodes();
    expect(calls).toHaveLength(2);
  });

  it('defaults the cache lifetime to 24 h', async () => {
    let t = 0;
    const { repo, calls } = client([serve('/list/code', '68-list-code-pagesize200')], {
      now: () => new Date(t),
    });
    await repo.listCodes();
    t = DAY_MS - 1;
    await repo.listCodes();
    expect(calls).toHaveLength(1);
    t = DAY_MS;
    await repo.listCodes();
    expect(calls).toHaveLength(2);
  });

  it('does not cache a failure', async () => {
    let fail = true;
    const { repo, calls } = client([
      {
        path: '/list/code',
        when: () => fail,
        reply: new VigueurError('upstream_unavailable', 'down'),
      },
      serve('/list/code', '68-list-code-pagesize200'),
    ]);
    await rejection(repo.listCodes());
    fail = false;
    expect(await repo.listCodes()).toHaveLength(108);
    expect(calls).toHaveLength(2);
  });
});

describe('findArticleAt', () => {
  it('searches CODE_DATE by number, code and date (fixture 03)', async () => {
    const { repo, calls } = client([serve('/search', '03-search-code-date-1382-2015')]);
    const { hits, truncated } = await repo.findArticleAt('Code civil', '1382', '2015-01-01');
    expect(truncated).toBe(false);
    expect(calls.map((c) => c.req)).toEqual([
      {
        method: 'POST',
        path: '/search',
        body: {
          fond: 'CODE_DATE',
          recherche: {
            champs: [
              {
                typeChamp: 'NUM_ARTICLE',
                criteres: [{ typeRecherche: 'EXACTE', valeur: '1382', operateur: 'ET' }],
                operateur: 'ET',
              },
            ],
            filtres: [
              { facette: 'NOM_CODE', valeurs: ['Code civil'] },
              { facette: 'DATE_VERSION', singleDate: '2015-01-01' },
            ],
            pageNumber: 1,
            pageSize: 20,
            operateur: 'ET',
            sort: 'PERTINENCE',
            typePagination: 'ARTICLE',
          },
        },
      },
    ]);
    expect(hits).toEqual([
      {
        id: 'LEGIARTI000006438819',
        num: '1382',
        codeId: 'LEGITEXT000006070721',
        codeTitle: 'Code civil',
        status: 'amended',
        rawStatus: 'MODIFIE',
        validFrom: '1804-03-21',
        validTo: '2016-10-01',
        validToUndetermined: false,
      },
    ]);
  });

  it('searches every code when no code is given (fixture 74)', async () => {
    const { repo, calls } = client([serve('/search', '74-search-code-date-L1234-1-all-codes')]);
    const { hits } = await repo.findArticleAt(null, 'L1234-1', '2026-11-12');
    const body = calls[0]?.req.body as { recherche: { filtres: unknown[] } };
    expect(body.recherche.filtres).toEqual([{ facette: 'DATE_VERSION', singleDate: '2026-11-12' }]);
    expect(hits.map((h) => h.codeTitle)).toEqual(['Code du travail', 'Code de la santé publique']);
    expect(hits.map((h) => h.codeId)).toEqual(['LEGITEXT000006072050', 'LEGITEXT000006072665']);
    expect(hits.every((h) => h.validTo === null && h.status === 'in_force')).toBe(true);
  });

  it('keeps only extracts with exactly that number', async () => {
    const { repo } = client([serve('/search', '03-search-code-date-1382-2015')]);
    expect(await repo.findArticleAt('Code civil', '1382-1', '2015-01-01')).toEqual({
      hits: [],
      truncated: false,
    });
  });

  it('says the page was truncated when it holds a full page of extracts, matching or not', async () => {
    // 20 extracts (the page size), only one of them numbered 1: more versions may follow.
    const extracts = Array.from({ length: 20 }, (_, i) => ({
      id: `LEGIARTI0000000000${String(i).padStart(2, '0')}`,
      num: i === 0 ? '1' : `1-${i}`,
      legalStatus: 'VIGUEUR',
      dateDebut: '2016-10-01T00:00:00.000+0000',
      dateFin: '2999-01-01T00:00:00.000+0000',
    }));
    const { repo } = client([reply('/search', searchPage(extracts))]);
    const page = await repo.findArticleAt(null, '1', '2026-11-12');
    expect(page.hits.map((h) => h.id)).toEqual(['LEGIARTI000000000000']);
    expect(page.truncated).toBe(true);
  });

  it('matches a number typed with other case or spacing, returning the official one', async () => {
    const { repo, calls } = client([reply('/search', cgiSearch('VIGUEUR'))]);
    const { hits } = await repo.findArticleAt(
      'Code général des impôts',
      '199 UNDECIES  b',
      '2026-11-12',
    );
    // The request carries the number as given; only the hit filter folds case and spacing.
    const body = calls[0]?.req.body as { recherche: { champs: unknown } };
    expect(body.recherche.champs).toEqual([
      {
        typeChamp: 'NUM_ARTICLE',
        criteres: [{ typeRecherche: 'EXACTE', valeur: '199 UNDECIES  b', operateur: 'ET' }],
        operateur: 'ET',
      },
    ]);
    expect(hits).toEqual([
      {
        id: 'LEGIARTI000046892900',
        num: '199 undecies B',
        codeId: 'LEGITEXT000006069577',
        codeTitle: 'Code général des impôts',
        status: 'in_force',
        rawStatus: 'VIGUEUR',
        validFrom: '2026-01-01',
        validTo: null,
        validToUndetermined: false,
      },
    ]);
  });

  it('flags a hit whose end date Légifrance has not determined', async () => {
    const extract = {
      id: 'LEGIARTI000000000001',
      num: '1',
      legalStatus: 'ABROGE_DIFF',
      dateDebut: '2005-01-28T00:00:00.000+0000',
      dateFin: '2222-02-22T00:00:00.000+0000',
    };
    const { repo } = client([reply('/search', searchPage([extract]))]);
    const { hits } = await repo.findArticleAt(null, '1', '2026-11-12');
    expect(hits[0]).toMatchObject({ validTo: null, validToUndetermined: true });
  });
});

/** A by-number search response in one code (shaped like fixture 03) holding `extracts`. */
function searchPage(extracts: unknown[]) {
  return {
    results: [
      {
        titles: [{ id: 'LEGITEXT000006070721_01-11-2026', title: 'Code civil' }],
        sections: [{ id: 'LEGISCTA000000000001', extracts }],
      },
    ],
    totalResultNumber: 1,
    typePagination: 'ARTICLE',
  };
}

/** A search response shaped like fixtures 03 and 74, for CGI art. 199 undecies B. */
function cgiSearch(legalStatus: string) {
  return {
    results: [
      {
        titles: [
          {
            id: 'LEGITEXT000006069577_01-11-2026',
            cid: 'LEGITEXT000006069577',
            title: 'Code général des impôts',
          },
        ],
        sections: [
          {
            id: 'LEGISCTA000006191613',
            extracts: [
              {
                id: 'LEGIARTI000046892900',
                num: '199 undecies B',
                legalStatus,
                dateDebut: '2026-01-01T00:00:00.000+0000',
                dateFin: '2999-01-01T00:00:00.000+0000',
              },
            ],
          },
        ],
      },
    ],
    totalResultNumber: 1,
    typePagination: 'ARTICLE',
  };
}

describe('findArticleAllVersions', () => {
  it('searches CODE_ETAT with no status filter (fixture 110)', async () => {
    const { repo, calls } = client([
      serve('/search', '110-search-code-etat-num-1382-all-versions'),
    ]);
    const { hits, truncated } = await repo.findArticleAllVersions('Code civil', '1382');
    expect(truncated).toBe(false);
    const body = calls[0]?.req.body as {
      fond: string;
      recherche: { filtres: Array<{ facette: string }>; champs: unknown };
    };
    expect(body.fond).toBe('CODE_ETAT');
    expect(body.recherche.filtres).toEqual([{ facette: 'TEXT_NOM_CODE', valeurs: ['Code civil'] }]);
    expect(body.recherche.champs).toEqual([
      {
        typeChamp: 'NUM_ARTICLE',
        criteres: [{ typeRecherche: 'EXACTE', valeur: '1382', operateur: 'ET' }],
        operateur: 'ET',
      },
    ]);
    expect(hits.map((h) => h.status)).toEqual(['amended', 'in_force']);
    expect(hits.map((h) => h.id)).toEqual(['LEGIARTI000006438819', 'LEGIARTI000032042379']);
    // titles[0] is a section here: the code comes from the LEGITEXT title.
    expect(hits.every((h) => h.codeId === 'LEGITEXT000006070721')).toBe(true);
    expect(hits.every((h) => h.codeTitle === 'Code civil' && h.num === '1382')).toBe(true);
  });

  it('reports a repealed article with its end date (fixture 108)', async () => {
    const { repo } = client([serve('/search', '108-search-code-etat-num-abroge-R4217-2')]);
    expect((await repo.findArticleAllVersions('Code du travail', 'R4217-2')).hits).toEqual([
      {
        id: 'LEGIARTI000018532352',
        num: 'R4217-2',
        codeId: 'LEGITEXT000006072050',
        codeTitle: 'Code du travail',
        status: 'repealed',
        rawStatus: 'ABROGE',
        validFrom: '2008-05-01',
        validTo: '2026-10-01',
        validToUndetermined: false,
      },
    ]);
  });

  it('reads up to 100 extracts and says when the page was full', async () => {
    const extract = (i: number) => ({
      id: `LEGIARTI000000000${String(i).padStart(3, '0')}`,
      num: '1',
      legalStatus: 'MODIFIE',
      dateDebut: '2000-01-01T00:00:00.000+0000',
      dateFin: '2001-01-01T00:00:00.000+0000',
    });
    const full = client([
      reply('/search', searchPage(Array.from({ length: 100 }, (_, i) => extract(i)))),
    ]);
    const page = await full.repo.findArticleAllVersions(null, '1');
    expect(full.calls[0]?.req.body).toMatchObject({ recherche: { pageSize: 100 } });
    expect(page).toMatchObject({ truncated: true });
    expect(page.hits).toHaveLength(100);
    const short = client([
      reply('/search', searchPage(Array.from({ length: 99 }, (_, i) => extract(i)))),
    ]);
    expect((await short.repo.findArticleAllVersions(null, '1')).truncated).toBe(false);
  });

  it('sends no code filter when no code is given', async () => {
    const { repo, calls } = client([serve('/search', '108-search-code-etat-num-abroge-R4217-2')]);
    await repo.findArticleAllVersions(null, 'R4217-2');
    const body = calls[0]?.req.body as { recherche: { filtres: unknown[] } };
    expect(body.recherche.filtres).toEqual([]);
  });

  it('matches a number typed in lower case, returning the official one', async () => {
    const { repo } = client([reply('/search', cgiSearch('MODIFIE'))]);
    const { hits } = await repo.findArticleAllVersions(null, ' 199 undecies b ');
    expect(hits.map((h) => [h.num, h.status])).toEqual([['199 undecies B', 'amended']]);
  });
});

describe('getArticle', () => {
  it('maps the 2015 version of Code civil art. 1382 (fixture 08)', async () => {
    const { repo, calls } = client([serve('/consult/getArticle', '08-getArticle-1382-old')]);
    const record = await repo.getArticle('LEGIARTI000006438819', '2015-01-01');
    expect(calls.map((c) => c.req)).toEqual([
      { method: 'POST', path: '/consult/getArticle', body: { id: 'LEGIARTI000006438819' } },
    ]);
    expect(record).not.toBeNull();
    if (record === null) return;
    expect(record.version.text.startsWith("Tout fait quelconque de l'homme")).toBe(true);
    expect(record.version).toMatchObject({
      id: 'LEGIARTI000006438819',
      number: '1382',
      status: 'amended',
      rawStatus: 'MODIFIE',
      validFrom: '1804-03-21',
      validTo: '2016-10-01',
    });
    expect(record.cid).toBe('LEGIARTI000006438819');
    expect(record.codeId).toBe('LEGITEXT000006070721');
    expect(record.codeTitle).toBe('Code civil');
    expect(record.nota).toBeNull();
    expect(record.sectionCid).toBe('LEGISCTA000006136352');
    expect(record.sectionPath.at(-1)).toContain('Des délits et des quasi-délits');
    expect(record.sectionPath.some((s) => s.includes('De la preuve des obligations'))).toBe(false);
    // The 2016 title of the same section belongs to later versions only.
    expect(record.sectionPath).toEqual([
      'Livre III : Des différentes manières dont on acquiert la propriété',
      'Titre IV : Des engagements qui se forment sans convention',
      'Chapitre II : Des délits et des quasi-délits.',
    ]);
    expect(record.versions).toEqual([
      {
        id: 'LEGIARTI000006438819',
        version: '1.0',
        status: 'amended',
        rawStatus: 'MODIFIE',
        validFrom: '1804-03-21',
        validTo: '2016-10-01',
        validToUndetermined: false,
      },
      {
        id: 'LEGIARTI000032042379',
        version: '2.0',
        status: 'in_force',
        rawStatus: 'VIGUEUR',
        validFrom: '2016-10-01',
        validTo: null,
        validToUndetermined: false,
      },
    ]);
    expect(record.version).not.toHaveProperty('validToUndetermined');
    expect(record.modifications).toEqual([
      { kind: 'codification', textTitle: 'Loi 1804-02-09', effectiveDate: null },
      {
        kind: 'creation',
        textTitle: 'Loi 1804-02-09 promulguée le 19 février 1804',
        effectiveDate: null,
      },
    ]);
    expect(record.citationsCount).toBe(65);
  });

  it('returns null for an unknown id (fixture 17)', async () => {
    const { repo } = client([serve('/consult/getArticle', '17-getArticle-notfound')]);
    expect(await repo.getArticle('LEGIARTI999999999999', '2026-11-12')).toBeNull();
  });

  it('lists still-born versions (fixture 72)', async () => {
    const { repo } = client([serve('/consult/getArticle', '72-getArticle-vigueur-diff')]);
    const record = await repo.getArticle('LEGIARTI000052085723', '2026-11-12');
    expect(record?.version.status).toBe('deferred');
    expect(record?.versions).toContainEqual({
      id: 'LEGIARTI000036261495',
      version: '2.0',
      status: 'stillborn',
      rawStatus: 'MODIFIE_MORT_NE',
      validFrom: '2022-01-01',
      validTo: '2017-12-22',
      validToUndetermined: false,
    });
    expect(record?.versions).toHaveLength(8);
  });

  it('keeps a recorded abrogation of a version marked in force (fixture 73)', async () => {
    const { repo } = client([serve('/consult/getArticle', '73-getArticle-abroge-L800-4')]);
    const record = await repo.getArticle('LEGIARTI000006651050', '2026-11-12');
    expect(record?.version.status).toBe('in_force');
    expect(record?.version.validTo).toBeNull();
    expect(record?.modifications).toContainEqual({
      kind: 'abrogation',
      textTitle: expect.stringContaining('Ordonnance n°2007-329 du 12 mars 2007 - art. 12'),
      effectiveDate: '2008-05-01',
    });
    expect(record?.nota).toMatch(/^Ordonnance 2007-329 du 12 mars 2007 art\. 12 I, art\. 13 :/);
  });

  it('keeps a huge article compact (fixture 59)', async () => {
    const { repo } = client([serve('/consult/getArticle', '59-getArticleWithIdAndNum-cgi-long')]);
    const record = await repo.getArticle('LEGIARTI000046892900', '2026-11-12');
    expect(record).not.toBeNull();
    expect(record?.citationsCount).toBe(101);
    expect(record?.nota).toContain('1er janvier 2026');
    expect(record?.versions).toHaveLength(35);
    expect(record?.version.number).toBe('199 undecies B');
    // Same title as /list/code and the search NOM_CODE facet (textTitles[0].titreLong).
    expect(record?.codeTitle).toBe('Code général des impôts');
    expect(JSON.stringify(record).length).toBeLessThan(60_000);
  });

  it('reads the nota from its HTML and maps a repealed version (fixture 104)', async () => {
    const { repo } = client([serve('/consult/getArticle', '104-getArticle-abroge-R4217-2')]);
    const record = await repo.getArticle('LEGIARTI000018532352', '2026-11-12');
    expect(record?.version).toMatchObject({ status: 'repealed', validTo: '2026-10-01' });
    expect(record?.cid).toBe('LEGIARTI000018488850');
    expect(record?.nota).toContain('abrogées à la date du 1er avril 2026');
    expect(record?.modifications.map((m) => m.kind)).toEqual([
      'creation',
      'abrogation',
      'abrogation',
    ]);
    expect(record?.sectionPath.at(-1)).toBe(
      'Chapitre VII : Installations sanitaires, restauration',
    );
  });

  it('prefers the HTML text, keeping paragraph breaks', async () => {
    const { repo } = client([
      reply(
        '/consult/getArticle',
        article({ texte: 'Un. Deux.', texteHtml: '<p>Un.</p><p>Deux.</p>' }),
      ),
    ]);
    const record = await repo.getArticle('LEGIARTI000000000001', '2026-11-12');
    expect(record?.version.text).toBe('Un.\nDeux.');
  });

  it('falls back to the plain text, then to an empty text', async () => {
    const plain = client([
      reply('/consult/getArticle', article({ texte: ' Seul texte. ', texteHtml: '' })),
    ]);
    expect((await plain.repo.getArticle('x', '2026-11-12'))?.version.text).toBe('Seul texte.');
    const none = client([reply('/consult/getArticle', article({ texte: null, texteHtml: null }))]);
    expect((await none.repo.getArticle('x', '2026-11-12'))?.version.text).toBe('');
  });

  it('takes the end date from the version list only when the article has none', async () => {
    const versions = [
      {
        id: 'LEGIARTI000000000001',
        etat: 'MODIFIE',
        version: '1.0',
        dateDebut: ms('2008-05-01'),
        dateFin: ms('2016-10-01'),
      },
    ];
    const missing = client([
      reply('/consult/getArticle', article({ dateFin: null, articleVersions: versions })),
    ]);
    expect((await missing.repo.getArticle('x', '2026-11-12'))?.version.validTo).toBe('2016-10-01');
    const open = client([reply('/consult/getArticle', article({ articleVersions: versions }))]);
    expect((await open.repo.getArticle('x', '2026-11-12'))?.version.validTo).toBeNull();
  });

  it('maps an undetermined end date to null, flagged as undetermined', async () => {
    const versions = [
      {
        id: 'LEGIARTI000000000001',
        etat: 'ABROGE_DIFF',
        version: '1.0',
        dateDebut: ms('2008-05-01'),
        dateFin: ms('2222-02-22'),
      },
    ];
    const { repo } = client([
      reply(
        '/consult/getArticle',
        article({ etat: 'ABROGE_DIFF', dateFin: ms('2222-02-22'), articleVersions: versions }),
      ),
    ]);
    const record = await repo.getArticle('LEGIARTI000000000001', '2026-11-12');
    expect(record?.version).toMatchObject({
      status: 'repeal_pending',
      validTo: null,
      validToUndetermined: true,
    });
    expect(record?.versions[0]).toMatchObject({ validTo: null, validToUndetermined: true });
  });

  it('takes the undetermined end from the version list when the article has no end', async () => {
    const versions = [
      {
        id: 'LEGIARTI000000000001',
        etat: 'ABROGE_DIFF',
        version: '1.0',
        dateDebut: ms('2008-05-01'),
        dateFin: ms('2222-02-22'),
      },
    ];
    const { repo } = client([
      reply('/consult/getArticle', article({ dateFin: null, articleVersions: versions })),
    ]);
    const record = await repo.getArticle('LEGIARTI000000000001', '2026-11-12');
    expect(record?.version).toMatchObject({ validTo: null, validToUndetermined: true });
  });

  it('takes the start date from the version list when the article has none', async () => {
    const { repo } = client([
      reply(
        '/consult/getArticle',
        article({
          dateDebut: null,
          articleVersions: [
            {
              id: 'LEGIARTI000000000001',
              etat: 'VIGUEUR',
              version: '1.0',
              dateDebut: ms('2010-01-01'),
              dateFin: ms('2999-01-01'),
            },
          ],
        }),
      ),
    ]);
    const record = await repo.getArticle('LEGIARTI000000000001', '2026-11-12');
    expect(record?.version.validFrom).toBe('2010-01-01');
  });

  it('rejects an article with no start date at all', async () => {
    const { repo } = client([
      reply('/consult/getArticle', article({ dateDebut: ms('2999-01-01'), articleVersions: [] })),
    ]);
    const err = await rejection(repo.getArticle('LEGIARTI000000000001', '2026-11-12'));
    expect(err.kind).toBe('upstream_unavailable');
    expect(err.message).toBe('Légifrance: article LEGIARTI000000000001 has no start date.');
  });

  it('shows the section titles in force on asOf when a section was renamed', async () => {
    const titresTM = [
      { debut: '2008-05-01', fin: '2999-01-01', titre: 'Partie A', xPath: '/A/TM/TITRE_TM' },
      { debut: '2008-05-01', fin: '2018-01-01', titre: 'Titre II : Ancien', xPath: '/A/TM/TM/T' },
      { debut: '2018-01-01', fin: '2999-01-01', titre: 'Titre II : Nouveau', xPath: '/A/TM/TM/T' },
      // Inverted (empty) period, as seen in fixture 72: never shown.
      { debut: '2012-05-01', fin: '2010-03-02', titre: 'TITRE II : VIDE', xPath: '/A/TM/TM/T' },
    ];
    const { repo } = client([reply('/consult/getArticle', article({ context: { titresTM } }))]);
    const at = async (asOf: string) => (await repo.getArticle('x', asOf))?.sectionPath;
    expect(await at('2015-06-01')).toEqual(['Partie A', 'Titre II : Ancien']);
    expect(await at('2026-11-12')).toEqual(['Partie A', 'Titre II : Nouveau']);
    // Before the version starts: the titles it started with.
    expect(await at('2000-01-01')).toEqual(['Partie A', 'Titre II : Ancien']);
  });

  it('never shows headings from outside the version, even when asOf is later (fixture 08)', async () => {
    const { repo } = client([serve('/consult/getArticle', '08-getArticle-1382-old')]);
    const record = await repo.getArticle('LEGIARTI000006438819', '2026-11-12');
    expect(record?.sectionPath).toEqual([
      'Livre III : Des différentes manières dont on acquiert la propriété',
      'Titre IV : Des engagements qui se forment sans convention',
      'Chapitre II : Des délits et des quasi-délits.',
    ]);
  });

  it('places a still-born version (inverted dates) at its start date', async () => {
    const titresTM = [
      { debut: '2008-05-01', fin: '2018-01-01', titre: 'Titre II : Ancien', xPath: '/A/TM/T' },
      { debut: '2018-01-01', fin: '2999-01-01', titre: 'Titre II : Nouveau', xPath: '/A/TM/T' },
    ];
    const stillborn = article({
      etat: 'MODIFIE_MORT_NE',
      dateDebut: ms('2022-01-01'),
      dateFin: ms('2017-12-22'),
      context: { titresTM },
    });
    const { repo } = client([reply('/consult/getArticle', stillborn)]);
    const record = await repo.getArticle('x', '2026-11-12');
    expect(record?.version).toMatchObject({
      status: 'stillborn',
      validFrom: '2022-01-01',
      validTo: '2017-12-22',
    });
    expect(record?.sectionPath).toEqual(['Titre II : Nouveau']);
  });
});

describe('getArticleHistory', () => {
  it('flattens the chronology (fixture 16)', async () => {
    const { repo, calls } = client([
      serve('/chrono/textCidAndElementCid', '16-chrono-textCidAndElementCid-1382'),
    ]);
    const history = await repo.getArticleHistory('LEGITEXT000006070721', 'LEGIARTI000006438819');
    expect(calls.map((c) => c.req)).toEqual([
      {
        method: 'POST',
        path: '/chrono/textCidAndElementCid',
        body: { textCid: 'LEGITEXT000006070721', elementCid: 'LEGIARTI000006438819' },
      },
    ]);
    expect(history).toContainEqual({
      date: '2016-10-01',
      undetermined: false,
      action: 'modification',
      amendingTitle: 'Ordonnance n°2016-131 du 10 février 2016 - art. 4',
      amendingArticleId: 'LEGIARTI000032006595',
    });
    expect(history).toHaveLength(3);
    expect(history[0]).toEqual({
      date: '1804-03-21',
      undetermined: false,
      action: 'creation',
      amendingTitle: 'Un texte d’une portée générale',
      amendingArticleId: null,
    });
  });

  it('maps undetermined dates and every action, oldest first', async () => {
    const modifier = (id: string, title: string, actions: string[]) => ({
      [id]: { title, id, actions: Object.fromEntries(actions.map((a) => [a, { action: a }])) },
    });
    const { repo } = client([
      reply('/chrono/textCidAndElementCid', {
        regroupements: [
          {
            title: '2222',
            detailLoaded: true,
            versions: {
              '2222-02-22': {
                dateDebut: ms('2222-02-22'),
                articlesModificateurs: modifier('LEGIARTI2', 'Ordonnance 2007-329', ['ABROGATION']),
              },
            },
          },
          {
            title: '2010',
            detailLoaded: true,
            versions: {
              '2010-01-01': {
                dateDebut: ms('2010-01-01'),
                articlesModificateurs: modifier('JORFTEXT1', 'Loi X', [
                  'DEPLACEMENT',
                  'CODIFICATION',
                  'AUTRE',
                ]),
              },
            },
          },
          { title: '1990', detailLoaded: false, versions: {} },
        ],
      }),
    ]);
    expect(await repo.getArticleHistory('LEGITEXT1', 'LEGIARTI1')).toEqual([
      {
        date: '2010-01-01',
        undetermined: false,
        action: 'transfer',
        amendingTitle: 'Loi X',
        amendingArticleId: 'JORFTEXT1',
      },
      {
        date: '2010-01-01',
        undetermined: false,
        action: 'codification',
        amendingTitle: 'Loi X',
        amendingArticleId: 'JORFTEXT1',
      },
      {
        date: '2010-01-01',
        undetermined: false,
        action: 'other',
        amendingTitle: 'Loi X',
        amendingArticleId: 'JORFTEXT1',
      },
      {
        date: null,
        undetermined: true,
        action: 'abrogation',
        amendingTitle: 'Ordonnance 2007-329',
        amendingArticleId: 'LEGIARTI2',
      },
    ]);
  });
});

describe('getConcordance', () => {
  it('maps old and new numbers (fixture 11)', async () => {
    const { repo, calls } = client([
      serve('/consult/concordanceLinksArticle', '11-concordanceLinks-1382-old'),
    ]);
    const concordance = await repo.getConcordance('LEGIARTI000006438819');
    expect(calls.map((c) => c.req)).toEqual([
      {
        method: 'POST',
        path: '/consult/concordanceLinksArticle',
        body: { articleId: 'LEGIARTI000006438819' },
      },
    ]);
    expect(concordance.to).toEqual([
      {
        id: 'LEGIARTI000032041571',
        num: '1240',
        codeTitle: 'Code civil',
        label: 'Code civil - art. 1240 (V)',
      },
    ]);
    expect(concordance.from).toHaveLength(1);
    expect(concordance.from[0]?.num).toBe('1353');
  });

  it('handles an article with no successor (fixture 14)', async () => {
    const { repo } = client([
      serve('/consult/concordanceLinksArticle', '14-concordanceLinks-1240'),
    ]);
    expect(await repo.getConcordance('LEGIARTI000032041571')).toEqual({
      from: [
        {
          id: 'LEGIARTI000006438819',
          num: '1382',
          codeTitle: 'Code civil',
          label: 'Code civil - art. 1382 (M)',
        },
      ],
      to: [],
    });
  });

  it('reads a missing or null list as empty', async () => {
    const ref = { name: 'Code civil - art. 1240 (V)', id: 'LEGIARTI000032041571' };
    const onlyNew = client([reply('/consult/concordanceLinksArticle', { newTexts: [ref] })]);
    expect(await onlyNew.repo.getConcordance('LEGIARTI0')).toEqual({
      from: [],
      to: [
        {
          id: 'LEGIARTI000032041571',
          num: '1240',
          codeTitle: 'Code civil',
          label: 'Code civil - art. 1240 (V)',
        },
      ],
    });
    const none = client([
      reply('/consult/concordanceLinksArticle', { oldTexts: null, newTexts: null }),
    ]);
    expect(await none.repo.getConcordance('LEGIARTI0')).toEqual({ from: [], to: [] });
  });

  it('parses labels without a flag and leaves unparsable ones null', async () => {
    const { repo } = client([
      reply('/consult/concordanceLinksArticle', {
        oldTexts: [{ name: 'Code de commerce - art. L225-102-5', id: 'LEGIARTI1' }],
        newTexts: [{ name: 'Annexe sans numéro', id: 'LEGIARTI2' }],
      }),
    ]);
    expect(await repo.getConcordance('LEGIARTI0')).toEqual({
      from: [
        {
          id: 'LEGIARTI1',
          num: 'L225-102-5',
          codeTitle: 'Code de commerce',
          label: 'Code de commerce - art. L225-102-5',
        },
      ],
      to: [{ id: 'LEGIARTI2', num: null, codeTitle: null, label: 'Annexe sans numéro' }],
    });
  });
});

const ALL_PATHS: FakeRoute[] = [
  serve('/list/code', '68-list-code-pagesize200'),
  serve('/search', '03-search-code-date-1382-2015'),
  serve('/consult/getArticle', '08-getArticle-1382-old'),
  serve('/chrono/textCidAndElementCid', '16-chrono-textCidAndElementCid-1382'),
  serve('/consult/concordanceLinksArticle', '11-concordanceLinks-1382-old'),
];

const CALLS: Array<
  [string, (repo: LegislationRepository, signal?: AbortSignal) => Promise<unknown>]
> = [
  ['listCodes', (r, signal) => r.listCodes({ signal })],
  ['findArticleAt', (r, signal) => r.findArticleAt('Code civil', '1382', '2015-01-01', { signal })],
  ['findArticleAllVersions', (r, signal) => r.findArticleAllVersions(null, '1382', { signal })],
  ['getArticle', (r, signal) => r.getArticle('LEGIARTI000006438819', '2015-01-01', { signal })],
  ['getArticleHistory', (r, signal) => r.getArticleHistory('LEGITEXT1', 'LEGIARTI1', { signal })],
  ['getConcordance', (r, signal) => r.getConcordance('LEGIARTI000006438819', { signal })],
];

describe('cancellation', () => {
  for (const [name, call] of CALLS) {
    it(`${name} forwards the caller's signal`, async () => {
      const { repo, calls } = client(ALL_PATHS);
      const { signal } = new AbortController();
      await call(repo, signal);
      expect(calls).toHaveLength(1);
      expect(calls[0]?.opts?.signal).toBe(signal);
    });
  }
});

describe('unexpected payloads', () => {
  const malformed: Array<[string, FakeRoute[]]> = [
    ['listCodes', [reply('/list/code', { results: 'none' })]],
    [
      'findArticleAt',
      [
        reply('/search', {
          results: [{ titles: [], sections: [{ extracts: [{ id: 'LEGIARTI1', num: '1382' }] }] }],
        }),
      ],
    ],
    ['findArticleAllVersions', [reply('/search', {})]],
    ['getArticle', [reply('/consult/getArticle', { article: { texte: 'no id' } })]],
    ['getArticleHistory', [reply('/chrono/textCidAndElementCid', { regroupements: {} })]],
    ['getConcordance', [reply('/consult/concordanceLinksArticle', { oldTexts: [{ name: 'x' }] })]],
  ];
  for (const [name, routes] of malformed) {
    it(`${name} reports an upstream error, never a TypeError`, async () => {
      const call = CALLS.find(([n]) => n === name)?.[1];
      if (call === undefined) throw new Error(name);
      const err = await rejection(call(client(routes).repo));
      expect(err.kind).toBe('upstream_unavailable');
      expect(err.message).toMatch(/^Légifrance: unexpected response/);
    });
  }

  for (const [name, call] of CALLS) {
    it(`${name} rejects a null body`, async () => {
      const routes = ALL_PATHS.map((r) => reply(r.path, null));
      const err = await rejection(call(client(routes).repo));
      expect(err.kind).toBe('upstream_unavailable');
    });
  }
});
