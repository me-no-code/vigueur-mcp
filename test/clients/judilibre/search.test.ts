import { describe, expect, it } from 'vitest';
import { createJudilibreClient } from '../../../src/clients/judilibre/client.js';
import { mapHit } from '../../../src/clients/judilibre/wire.js';
import { createTokenProvider } from '../../../src/clients/piste/auth.js';
import { pisteEndpoints } from '../../../src/clients/piste/endpoints.js';
import type { PisteHttp, PisteRequest } from '../../../src/clients/piste/http.js';
import { createPisteHttp } from '../../../src/clients/piste/http.js';
import type { JudilibreQuery } from '../../../src/services/case-law/ports.js';
import { VigueurError } from '../../../src/shared/errors.js';
import { loadFixture } from '../../helpers/fake-piste-http.js';
import { type FixtureRoute, fixtureFetch } from '../../helpers/fixture-fetch.js';

const base: JudilibreQuery = {
  query: 'forfait jours',
  operator: 'exact',
  jurisdiction: 'cc',
  sort: 'newest',
  page: 0,
  pageSize: 10,
};

/** A `PisteHttp` that records the request and answers `body`. */
function capture(body: unknown) {
  const requests: PisteRequest[] = [];
  const http: PisteHttp = {
    async request<T>(req: PisteRequest): Promise<T> {
      requests.push(req);
      return body as T;
    },
  };
  return { repo: createJudilibreClient(http), requests };
}

/** The real `PisteHttp` over the fixture router, answering a Judilibre fixture. */
function viaFixture(fixture: string, status?: number) {
  const route: FixtureRoute = {
    api: 'judilibre',
    path: '/search',
    fixture,
    ...(status !== undefined && { status }),
  };
  const { fetch, unmatched } = fixtureFetch([route]);
  const endpoints = pisteEndpoints('sandbox');
  const http = createPisteHttp({
    baseUrl: endpoints.judilibreBaseUrl,
    source: 'judilibre',
    tokens: createTokenProvider({
      tokenUrl: endpoints.oauthTokenUrl,
      clientId: 'id',
      clientSecret: 'secret',
      fetch,
    }),
    fetch,
  });
  return { repo: createJudilibreClient(http), unmatched };
}

const J11 = '11-search-eval-forfait-jours-exact-cc-soc-date-desc';
const J05 = '05-search-number-24-16.924';
const J21 = '21-search-ca-paris-bail-date-desc';
const J19 = '19-search-type-arret-cc-recent';
const J61 = '61-search-number-23-20.348-rnsm';
const J15 = '15-search-page-beyond-total';
const J13 = '13-err-search-page-size-51';

describe('judilibre search request', () => {
  it('sends the wire parameters and never type or theme', async () => {
    const { repo, requests } = capture(loadFixture(J11, 'judilibre'));
    await repo.search({ ...base, chamber: 'social' });
    const req = requests[0];
    expect(req?.method).toBe('GET');
    expect(req?.path).toBe('/search');
    expect(req?.query).toMatchObject({
      query: 'forfait jours',
      operator: 'exact',
      chamber: 'soc',
      sort: 'date',
      order: 'desc',
      page: 0,
      page_size: 10,
      jurisdiction: 'cc',
    });
    expect(Object.keys(req?.query ?? {})).not.toContain('type');
    expect(Object.keys(req?.query ?? {})).not.toContain('theme');
  });

  it('sends neither sort nor order for relevance', async () => {
    const { repo, requests } = capture(loadFixture(J11, 'judilibre'));
    await repo.search({ ...base, sort: 'relevance' });
    const query = requests[0]?.query ?? {};
    expect(query.sort).toBeUndefined();
    expect(query.order).toBeUndefined();
  });

  it('sends oldest as sort=date&order=asc and the date bounds as date_start/date_end', async () => {
    const { repo, requests } = capture(loadFixture(J11, 'judilibre'));
    await repo.search({ ...base, sort: 'oldest', dateFrom: '2025-01-01', dateTo: '2025-12-31' });
    expect(requests[0]?.query).toMatchObject({
      sort: 'date',
      order: 'asc',
      date_start: '2025-01-01',
      date_end: '2025-12-31',
    });
  });
});

describe('judilibre search mapping', () => {
  it('maps a Cour de cassation page', async () => {
    const page = await capture(loadFixture(J11, 'judilibre')).repo.search(base);
    expect(page.total).toBe(568);
    const hit = page.hits[0];
    expect(hit?.id).toBe('6abcc10bc27382d099087409');
    expect(hit?.numbers).toEqual(['25-14.434']);
    expect(hit?.decisionDate).toBe('2026-09-30');
    expect(hit?.chamber).toEqual({ key: 'soc', label: 'Chambre sociale' });
    expect(hit?.formation?.label).toBe('Formation restreinte hors RNSM/NA');
    expect(hit?.publication).toEqual([]);
    expect(hit?.solution?.label).toBe('Cassation');
    expect(hit?.ecli).toBe('ECLI:FR:CCASS:2026:SO00769');
    expect(hit?.highlights.length).toBeLessThanOrEqual(2);
    expect(hit?.highlights.join(' ')).toContain('**');
    expect(hit?.highlights.join(' ')).not.toContain('<em>');
  });

  it('maps a search by number', async () => {
    const page = await capture(loadFixture(J05, 'judilibre')).repo.search(base);
    expect(page.hits[0]?.numbers).toEqual(['24-16.924']);
    expect(page.hits[0]?.id).toBe('694252ab61c46255e1711cac');
  });

  it('keeps appeal-court chamber and outcome as free text', async () => {
    const hit = (
      await capture(loadFixture(J21, 'judilibre')).repo.search({ ...base, jurisdiction: 'ca' })
    ).hits[0];
    expect(hit?.chamber).toEqual({ key: 'Pôle 4 - Chambre 4', label: 'Pôle 4 - Chambre 4' });
    expect(hit?.solution).toBeNull();
    expect(hit?.solutionText).toBe(
      'Infirme partiellement, réforme ou modifie certaines dispositions de la décision déférée',
    );
    expect(hit?.location?.key).toBe('ca_paris');
    expect(hit?.ecli).toBeNull();
  });

  it('reports a relaxed empty answer', async () => {
    const page = await capture(loadFixture(J19, 'judilibre')).repo.search(base);
    expect(page.relaxed).toBe(true);
    expect(page.total).toBe(0);
  });

  it('maps a non specially motivated rejection', async () => {
    const page = await capture(loadFixture(J61, 'judilibre')).repo.search(base);
    expect(page.total).toBe(1);
    const hit = page.hits[0];
    expect(hit?.numbers).toEqual(['23-20.348']);
    expect(hit?.chamber?.label).toBe('Deuxième chambre civile');
    expect(hit?.formation).toEqual({
      key: 'frr',
      label: 'Formation restreinte RNSM/NA (rejet non spécialement motivé ou non-admission)',
    });
    expect(hit?.solution?.label).toBe('Rejet');
    expect(hit?.publication).toEqual([]);
  });

  it('returns no hits for a page past the end', async () => {
    const page = await capture(loadFixture(J15, 'judilibre')).repo.search({ ...base, page: 5 });
    expect(page.hits).toEqual([]);
    expect(page.total).toBe(1);
  });

  it('works through the real HTTP layer', async () => {
    const { repo, unmatched } = viaFixture(J11);
    expect((await repo.search(base)).total).toBe(568);
    expect(unmatched).toEqual([]);
  });

  it('cleans highlights in linear time on unclosed tags (upstream text is untrusted)', () => {
    const start = performance.now();
    mapHit({ id: 'x', jurisdiction: 'cc', highlights: { text: ['<em x'.repeat(20_000)] } });
    expect(performance.now() - start).toBeLessThan(300);
  });

  it('deduplicates numbers, falls back to number, and maps a free-text tj outcome', () => {
    const hit = mapHit({
      id: 'x',
      jurisdiction: 'cc',
      number: '23-20.348',
      numbers: ['23-20.348', '23-20.348', '11-16.304', '23-20.348'],
    });
    expect(hit.numbers).toEqual(['23-20.348', '11-16.304']);
    expect(mapHit({ id: 'y', jurisdiction: 'ca', number: '26/05723' }).numbers).toEqual([
      '26/05723',
    ]);
    const tj = mapHit({ id: 'z', jurisdiction: 'tj', solution: 'Condamne le défendeur' });
    expect(tj.solution).toBeNull();
    expect(tj.solutionText).toBe('Condamne le défendeur');
    expect(mapHit({ id: 'u', jurisdiction: 'cc', formation: 'zz' }).formation).toEqual({
      key: 'zz',
      label: 'zz',
    });
  });
});

describe('judilibre search errors', () => {
  it('reports a malformed body as an unexpected response', async () => {
    const err = await capture({ results: 'x' })
      .repo.search(base)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(VigueurError);
    expect((err as VigueurError).kind).toBe('unexpected_response');
    expect((err as VigueurError).message).toMatch(/^Judilibre:/);
  });

  it('reports the recorded page_size 400 as invalid input', async () => {
    const { repo } = viaFixture(J13, 400);
    const err = await repo.search({ ...base, pageSize: 51 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(VigueurError);
    expect((err as VigueurError).kind).toBe('invalid_input');
  });
});
