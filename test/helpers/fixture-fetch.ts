import { pisteEndpoints } from '../../src/clients/piste/endpoints.js';
import { type Config, loadConfig } from '../../src/config.js';
import type { FetchLike } from '../../src/shared/fetch.js';
import { fakeFetch } from './fake-fetch.js';
import { loadFixture } from './fake-piste-http.js';

/** Sandbox credentials: requests go to the sandbox hosts the router below answers. */
export function sandboxConfig(): Config {
  return loadConfig({ PISTE_CLIENT_ID: 'id', PISTE_CLIENT_SECRET: 'secret', PISTE_ENV: 'sandbox' });
}

export type FixtureRoute = {
  /** Path under the Légifrance prefix, e.g. `/search`. */
  path: string;
  /** Extra condition on the JSON request body; routes are tried in order. */
  when?: (body: unknown) => boolean;
  /** HTTP status of the answer (default 200), e.g. 400 for a recorded Légifrance error body. */
  status?: number;
} & (
  | {
      /** Fixture name under `test/fixtures/legifrance/`. */
      fixture: string;
    }
  | {
      /** A response body built here, for calls no recorded sample covers (say why at the route). */
      body: () => unknown;
    }
);

type Json = Record<string, unknown>;
const asJson = (v: unknown): Json => (typeof v === 'object' && v !== null ? (v as Json) : {});

/** A by-number `/search` on `fond` for article `num`. */
export function numberSearch(fond: 'CODE_DATE' | 'CODE_ETAT', num: string) {
  return (body: unknown): boolean => {
    const b = asJson(body);
    const champs = asJson(b.recherche).champs;
    const champ = asJson(Array.isArray(champs) ? champs[0] : undefined);
    const critere = asJson(Array.isArray(champ.criteres) ? champ.criteres[0] : undefined);
    return b.fond === fond && champ.typeChamp === 'NUM_ARTICLE' && critere.valeur === num;
  };
}

/** A by-number `/search` on `fond` for text number `num` (e.g. `78-17`). */
export function textNumberSearch(fond: 'LODA_DATE' | 'LODA_ETAT', num: string) {
  return (body: unknown): boolean => {
    const b = asJson(body);
    const champs = asJson(b.recherche).champs;
    const champ = asJson(Array.isArray(champs) ? champs[0] : undefined);
    const critere = asJson(Array.isArray(champ.criteres) ? champ.criteres[0] : undefined);
    return b.fond === fond && champ.typeChamp === 'NUM' && critere.valeur === num;
  };
}

/** Whether a `/search` body's NATURE / TEXT_NATURE filter is one of `natures` (`undefined`: none). */
function natureIn(body: unknown, natures: ReadonlyArray<string | undefined>): boolean {
  const filtres = asJson(asJson(body).recherche).filtres;
  const filter = (Array.isArray(filtres) ? filtres : [])
    .map(asJson)
    .find((f) => f.facette === 'NATURE' || f.facette === 'TEXT_NATURE');
  const valeurs = filter?.valeurs;
  return natures.includes(Array.isArray(valeurs) ? valeurs.join(',') : undefined);
}

/** A request whose body field `key` equals `value` (e.g. `/consult/getArticle` by `id`). */
export const bodyField =
  (key: string, value: string) =>
  (body: unknown): boolean =>
    asJson(body)[key] === value;

/** The filter-only JORF search behind the facets: every text (`*`), filtered by publication date. */
function jorfFilterOnlySearch(body: unknown): boolean {
  const b = asJson(body);
  const champs = asJson(b.recherche).champs;
  const champ = asJson(Array.isArray(champs) ? champs[0] : undefined);
  const critere = asJson(Array.isArray(champ.criteres) ? champ.criteres[0] : undefined);
  return b.fond === 'JORF' && champ.typeChamp === 'ALL' && critere.valeur === '*';
}

const DECRET_2005_1309 = ['LEGITEXT000006052580', 'LEGITEXT000006052581'];

/** `getArticleWithIdAndNum` returns the same payload as `getArticle`. */
export const LEGIFRANCE_FIXTURE_ROUTES: readonly FixtureRoute[] = [
  { path: '/list/code', fixture: '68-list-code-pagesize200' },
  // Code civil 1240 and 1382 (old 1382 content moved to 1240 on 2016-10-01).
  {
    path: '/search',
    when: numberSearch('CODE_DATE', '1240'),
    fixture: '02-search-code-date-1240-today',
  },
  {
    path: '/search',
    when: numberSearch('CODE_DATE', '1382'),
    fixture: '03-search-code-date-1382-2015',
  },
  {
    path: '/search',
    when: numberSearch('CODE_ETAT', '1382'),
    fixture: '110-search-code-etat-num-1382-all-versions',
  },
  {
    path: '/consult/getArticle',
    when: bodyField('id', 'LEGIARTI000032041571'),
    fixture: '06-getArticleWithIdAndNum-1240',
  },
  {
    path: '/consult/getArticle',
    when: bodyField('id', 'LEGIARTI000006437044'),
    fixture: '09-getArticle-1240-prev-version',
  },
  {
    path: '/consult/getArticle',
    when: bodyField('id', 'LEGIARTI000006438819'),
    fixture: '08-getArticle-1382-old',
  },
  {
    path: '/consult/getArticle',
    when: bodyField('id', 'LEGIARTI000032042379'),
    fixture: '07-getArticleWithIdAndNum-1382',
  },
  {
    path: '/consult/concordanceLinksArticle',
    when: bodyField('articleId', 'LEGIARTI000006438819'),
    fixture: '11-concordanceLinks-1382-old',
  },
  {
    path: '/consult/concordanceLinksArticle',
    when: bodyField('articleId', 'LEGIARTI000032041571'),
    fixture: '14-concordanceLinks-1240',
  },
  // Article history (Code civil 1382 lineage) and the Code civil change log 2025-2026.
  { path: '/chrono/textCidAndElementCid', fixture: '16-chrono-textCidAndElementCid-1382' },
  // Loi 78-17 by its JORFTEXT cid (2025-2026 loaded), before the Code civil catch-all.
  {
    path: '/chrono/textCid',
    when: bodyField('textCid', 'JORFTEXT000000886460'),
    fixture: '83-chrono-textCid-loda-jorfcid',
  },
  { path: '/chrono/textCid', fixture: '24-chrono-textCid-civil-2025-2026' },
  // Current version of 1382: not recorded. It shows only the 1353 link (the 1240 link belongs
  // to the old version), so it is answered with the old version's links minus newTexts.
  {
    path: '/consult/concordanceLinksArticle',
    when: bodyField('articleId', 'LEGIARTI000032042379'),
    body: () => ({ ...(loadFixture('11-concordanceLinks-1382-old') as object), newTexts: [] }),
  },
  // L1234-1: Code du travail and Code de la santé publique.
  {
    path: '/search',
    when: numberSearch('CODE_DATE', 'L1234-1'),
    fixture: '74-search-code-date-L1234-1-all-codes',
  },
  // CGI art. 199 undecies B: a ~32 000-character article with 35 versions.
  {
    path: '/consult/getArticle',
    when: bodyField('id', 'LEGIARTI000046892900'),
    fixture: '59-getArticleWithIdAndNum-cgi-long',
  },
  // Code du travail R4217-2, repealed on 2026-10-01.
  {
    path: '/search',
    when: numberSearch('CODE_DATE', 'R4217-2'),
    fixture: '106-search-code-date-R4217-2-today',
  },
  {
    path: '/search',
    when: numberSearch('CODE_ETAT', 'R4217-2'),
    fixture: '108-search-code-etat-num-abroge-R4217-2',
  },
  // No sample of R4217-2's concordance: answered as an article with no concordance links.
  {
    path: '/consult/concordanceLinksArticle',
    when: bodyField('articleId', 'LEGIARTI000018532352'),
    body: () => ({ oldTexts: [], newTexts: [] }),
  },
  // Code civil art. 1240's chapter: 1240 first, then 1241.
  {
    path: '/consult/getSectionByCid',
    when: bodyField('cid', 'LEGISCTA000032021488'),
    fixture: '23-getSectionByCid-civ-ch1',
  },
  // Code civil art. 1241. Recorded 2026-11-13 from production (env production, HTTP 200) with
  // the project's PisteHttp: POST /consult/getArticle {"id":"LEGIARTI000032041565"}, body only.
  {
    path: '/consult/getArticle',
    when: bodyField('id', 'LEGIARTI000032041565'),
    fixture: '113-getArticle-1241',
  },
  // Code du travail table of contents, trimmed to Livre III of the first part.
  {
    path: '/consult/legi/tableMatieres',
    when: bodyField('textId', 'LEGITEXT000006072050'),
    fixture: '20-tableMatieres-code-travail.trimmed-livre-III',
  },
  // Journal officiel: the 3 latest issues (47) and the filter-only JORF search with facets (56).
  { path: '/consult/lastNJo', fixture: '47-lastNJo-3' },
  {
    path: '/search',
    when: jorfFilterOnlySearch,
    fixture: '56-search-jorf-wide-facets',
  },
  // Loi 78-17: one in-force hit by number, then its consolidated text.
  {
    path: '/search',
    when: textNumberSearch('LODA_DATE', '78-17'),
    fixture: '30-search-loda-date-num-78-17',
  },
  // Loi 78-17 read on 1970-01-01, before it existed: production answers the unknown-id 400 (the
  // client turned it into "no such text"; the 400 body was not recorded), so the
  // recorded unknown-id body answers it.
  {
    path: '/consult/lawDecree',
    when: (b) =>
      bodyField('textId', 'LEGITEXT000006068624')(b) && bodyField('date', '1970-01-01')(b),
    fixture: '65-err-lawDecree-unknown',
    status: 400,
  },
  {
    path: '/consult/lawDecree',
    when: bodyField('textId', 'LEGITEXT000006068624'),
    fixture: '48-lawDecree-loi-78-17',
  },
  // The LOLF (loi organique 2001-692). Recorded 2026-11-13 from production (HTTP 200) with the
  // project's client: POST /search LODA_DATE, NUM EXACTE "2001-692", DATE_VERSION 2026-11-13, no
  // nature (119) — LODA files organic laws under nature LOI: the same search with NATURE
  // ["LOI_ORGANIQUE"] answered 0 results, with NATURE ["LOI"] this same single result; and POST
  // /consult/lawDecree {"textId":"LEGITEXT000005631294","date":"2026-11-13"} (120).
  {
    path: '/search',
    when: (b) => textNumberSearch('LODA_DATE', '2001-692')(b) && natureIn(b, [undefined, 'LOI']),
    fixture: '119-search-loda-date-num-2001-692',
  },
  {
    path: '/consult/lawDecree',
    when: bodyField('textId', 'LEGITEXT000005631294'),
    fixture: '120-lawDecree-lolf-2001-692-today',
  },
  // Ordonnance 2016-131 as published in the Journal officiel, by NOR and by JORFTEXT id.
  {
    path: '/consult/getJoWithNor',
    when: bodyField('nor', 'JUSC1522466R'),
    fixture: '40-getJoWithNor-ord-2016-131',
  },
  {
    path: '/consult/jorf',
    when: bodyField('textCid', 'JORFTEXT000032004939'),
    fixture: '50-consult-jorf-ord-2016-131',
  },
  // An unknown text id: Légifrance answers HTTP 400 "L'expression à valider est fausse."
  {
    path: '/consult/lawDecree',
    when: bodyField('textId', 'LEGITEXT999999999999'),
    fixture: '65-err-lawDecree-unknown',
    status: 400,
  },
  // Décret 2005-1309 (repealed 2019-06-01): the in-force search lists two LEGITEXT containers of
  // one cid (114), the all-status search one (115).
  {
    path: '/search',
    when: textNumberSearch('LODA_DATE', '2005-1309'),
    fixture: '114-search-loda-date-num-decret-2005-1309',
  },
  {
    path: '/search',
    when: textNumberSearch('LODA_ETAT', '2005-1309'),
    fixture: '115-search-loda-etat-num-decret-2005-1309',
  },
  {
    path: '/consult/lawDecree',
    when: (b) =>
      bodyField('textId', 'LEGITEXT000006052581')(b) && bodyField('date', '2015-01-01')(b),
    fixture: '118-lawDecree-decret-2005-1309-581-2015',
  },
  // Read at any later date, both containers answer the same body but for their jurisState (checked
  // live on both); only …580's (fixture 116) is recorded, so it answers for both.
  {
    path: '/consult/lawDecree',
    when: (b) => DECRET_2005_1309.includes(String(asJson(b).textId)),
    fixture: '116-lawDecree-decret-2005-1309-580-today',
  },
];

/**
 * A `fetch` answering the sandbox OAuth token and Légifrance fixtures by path and request body.
 * Anything else gets a 404 and is listed in `unmatched` — assert it stays empty so a missing
 * fixture fails the test with the request that needed it.
 */
export function fixtureFetch(routes: readonly FixtureRoute[] = LEGIFRANCE_FIXTURE_ROUTES): {
  fetch: FetchLike;
  calls: Request[];
  unmatched: string[];
} {
  const endpoints = pisteEndpoints('sandbox');
  const unmatched: string[] = [];
  const { fetch, calls } = fakeFetch(async (req) => {
    if (req.method === 'POST' && req.url === endpoints.oauthTokenUrl) {
      return Response.json({ access_token: 'fixture-token', expires_in: 3600 });
    }
    const raw = await req.clone().text();
    if (req.url.startsWith(endpoints.legifranceBaseUrl)) {
      const path = req.url.slice(endpoints.legifranceBaseUrl.length);
      const body: unknown = raw === '' ? undefined : JSON.parse(raw);
      const route = routes.find((r) => r.path === path && (r.when?.(body) ?? true));
      if (route !== undefined) {
        return Response.json('fixture' in route ? loadFixture(route.fixture) : route.body(), {
          status: route.status ?? 200,
        });
      }
    }
    const request = `${req.method} ${req.url}${raw === '' ? '' : ` ${raw}`}`;
    unmatched.push(request);
    return new Response(`fixture-fetch: no fixture for ${request}`, { status: 404 });
  });
  return { fetch, calls, unmatched };
}
