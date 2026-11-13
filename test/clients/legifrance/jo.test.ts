import { describe, expect, it } from 'vitest';
import { createLegifranceClient } from '../../../src/clients/legifrance/client.js';
import { VigueurError } from '../../../src/shared/errors.js';
import { type FakeRoute, fakePisteHttp } from '../../helpers/fake-piste-http.js';

function client(routes: FakeRoute[]) {
  const fake = fakePisteHttp(routes);
  return { repo: createLegifranceClient(fake.http), calls: fake.calls };
}

const serve = (path: string, fixture: string): FakeRoute => ({ path, fixture });

describe('latestJo (fixture 47)', () => {
  it('maps three issues, newest first, with their publication dates', async () => {
    const { repo, calls } = client([serve('/consult/lastNJo', '47-lastNJo-3')]);
    const issues = await repo.latestJo(3);
    expect(calls.map((c) => c.req)).toEqual([
      { method: 'POST', path: '/consult/lastNJo', body: { nbElement: 3 } },
    ]);
    expect(issues).toHaveLength(3);
    const first = issues[0];
    if (first === undefined) throw new Error('expected an issue');
    expect(first.id).toBe('JORFCONT000055078255');
    expect(first.title).toBe('JORF n°0264 du 11 novembre 2026');
    expect(first.number).toBe('0264');
    expect(first.publishedOn).toBe('2026-11-11');
    expect(first.eliPath).toBe('/eli/jo/2026/11/11/0264');
    expect(issues.map((i) => i.publishedOn)).toEqual(['2026-11-11', '2026-11-10', '2026-11-08']);
  });

  it('flattens the nested structure into groups with a title path', async () => {
    const { repo } = client([serve('/consult/lastNJo', '47-lastNJo-3')]);
    const [first] = await repo.latestJo(3);
    const groups = first?.groups ?? [];
    expect(groups.length).toBeGreaterThan(0);
    expect(groups.every((g) => g.texts.length > 0)).toBe(true);
    expect(groups.every((g) => g.path[0] !== undefined)).toBe(true);
    expect(groups[0]?.path).toEqual([
      'Journal officiel "Lois et Décrets"',
      'Présidence de la République',
      "Promotion des militaires n'appartenant pas à l'armée active",
      'Ordre national de la Légion d’honneur',
    ]);
    const count = groups.reduce((n, g) => n + g.texts.length, 0);
    expect(count).toBe(108);
    const first0 = groups[0]?.texts[0];
    expect(first0).toMatchObject({
      id: 'JORFTEXT000055078260',
      nature: 'DECRET',
      ministry: 'Présidence de la République',
      emitter: 'Présidence de la République',
    });
    expect(first0?.title).toContain('Décret du 10 novembre 2026');
    const natures = new Set(groups.flatMap((g) => g.texts.map((t) => t.nature)));
    expect(natures.has('DECRET')).toBe(true);
  });

  it('turns empty strings into null', async () => {
    const { repo } = client([serve('/consult/lastNJo', '47-lastNJo-3')]);
    const [first] = await repo.latestJo(3);
    const texts = (first?.groups ?? []).flatMap((g) => g.texts);
    for (const t of texts) {
      expect(t.nature).not.toBe('');
      expect(t.ministry).not.toBe('');
      expect(t.emitter).not.toBe('');
    }
  });

  it.each([0, 11, 1.5])('rejects count %s before any request', async (count) => {
    const { repo, calls } = client([serve('/consult/lastNJo', '47-lastNJo-3')]);
    await expect(repo.latestJo(count)).rejects.toMatchObject({ kind: 'invalid_input' });
    await expect(repo.latestJo(count)).rejects.toBeInstanceOf(VigueurError);
    expect(calls).toHaveLength(0);
  });

  it('forwards the abort signal', async () => {
    const { repo, calls } = client([serve('/consult/lastNJo', '47-lastNJo-3')]);
    const signal = new AbortController().signal;
    await repo.latestJo(1, { signal });
    expect(calls[0]?.opts?.signal).toBe(signal);
  });

  it('reports a body without containers as an unexpected response', async () => {
    const { repo } = client([{ path: '/consult/lastNJo', reply: {} }]);
    await expect(repo.latestJo(1)).rejects.toMatchObject({ kind: 'unexpected_response' });
  });
});

describe('joIssuesBetween (fixture 57)', () => {
  it('sends day/month/year objects and lists issues without groups', async () => {
    const { repo, calls } = client([serve('/consult/jorfCont', '57-jorfCont-date-range')]);
    const issues = await repo.joIssuesBetween('2026-11-05', '2026-11-11');
    expect(calls.map((c) => c.req)).toEqual([
      {
        method: 'POST',
        path: '/consult/jorfCont',
        body: {
          start: { dayOfMonth: 5, month: 11, year: 2026 },
          end: { dayOfMonth: 11, month: 11, year: 2026 },
          pageNumber: 1,
          pageSize: 10,
        },
      },
    ]);
    expect(issues).toHaveLength(6);
    expect(issues.every((i) => i.groups === null)).toBe(true);
    expect(issues[0]).toMatchObject({
      id: 'JORFCONT000055078255',
      title: 'JORF n°0264 du 11 novembre 2026',
      publishedOn: '2026-11-11',
    });
  });
});

describe('joIssuesBetween paging', () => {
  const joCont = (n: number) => ({
    joCont: {
      id: `JORFCONT${String(n).padStart(12, '0')}`,
      titre: `JORF n°${n}`,
      num: String(n),
      datePubli: 1794355200000,
      idEli: `/eli/jo/2026/11/11/${n}`,
      structure: null,
    },
  });
  const page = (from: number, count: number, total: number) => ({
    items: Array.from({ length: count }, (_, i) => joCont(from + i)),
    totalNbResult: total,
  });
  const pageOf = (body: unknown) => (body as { pageNumber: number }).pageNumber;

  it('accumulates pages in order with an incrementing pageNumber', async () => {
    const { repo, calls } = client([
      { path: '/consult/jorfCont', when: (b) => pageOf(b) === 1, reply: page(1, 10, 13) },
      { path: '/consult/jorfCont', when: (b) => pageOf(b) === 2, reply: page(11, 3, 13) },
    ]);
    const issues = await repo.joIssuesBetween('2026-01-01', '2026-11-11');
    expect(issues.map((i) => i.number)).toEqual(
      Array.from({ length: 13 }, (_, i) => String(i + 1)),
    );
    expect(calls.map((c) => pageOf(c.req.body))).toEqual([1, 2]);
  });

  it('stops on an empty page', async () => {
    const { repo, calls } = client([
      { path: '/consult/jorfCont', when: (b) => pageOf(b) === 1, reply: page(1, 10, 99) },
      { path: '/consult/jorfCont', when: (b) => pageOf(b) === 2, reply: page(11, 0, 99) },
    ]);
    const issues = await repo.joIssuesBetween('2026-01-01', '2026-11-11');
    expect(issues).toHaveLength(10);
    expect(calls).toHaveLength(2);
  });

  it('refuses a partial list when the page cap is reached with issues remaining', async () => {
    const { repo, calls } = client([{ path: '/consult/jorfCont', reply: page(1, 10, 100000) }]);
    const err = await repo.joIssuesBetween('2000-01-01', '2026-11-11').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(VigueurError);
    expect(err).toMatchObject({ kind: 'invalid_input' });
    expect((err as Error).message).toContain('more than 500');
    expect((err as Error).message).toContain('2000-01-01');
    expect(calls).toHaveLength(50);
  });
});

describe('joIssue (fixture 69)', () => {
  it('reads one issue with its groups', async () => {
    const { repo, calls } = client([serve('/consult/jorfCont', '69-jorfCont-by-id')]);
    const issue = await repo.joIssue('JORFCONT000055078255');
    expect(calls[0]?.req.body).toEqual({
      id: 'JORFCONT000055078255',
      pageNumber: 1,
      pageSize: 10,
    });
    if (issue === null) throw new Error('expected an issue');
    expect(issue.title).toBe('JORF n°0264 du 11 novembre 2026');
    expect(issue.groups?.length).toBeGreaterThan(0);
  });

  it('is null when no issue comes back', async () => {
    const { repo } = client([
      { path: '/consult/jorfCont', reply: { items: [], totalNbResult: 0 } },
    ]);
    expect(await repo.joIssue('JORFCONT000000000000')).toBeNull();
  });
});

describe('jorfFacets (fixtures 56 and 96)', () => {
  const filterOnly = (from: string, to: string) => ({
    fond: 'JORF',
    recherche: {
      champs: [
        {
          typeChamp: 'ALL',
          criteres: [{ typeRecherche: 'UN_DES_MOTS', valeur: '*', operateur: 'ET' }],
          operateur: 'ET',
        },
      ],
      filtres: [{ facette: 'DATE_PUBLICATION', dates: { start: from, end: to } }],
      pageNumber: 1,
      pageSize: 1,
      operateur: 'ET',
      sort: 'PUBLICATION_DATE_DESC',
      typePagination: 'DEFAUT',
    },
  });

  it('sends a filter-only body on champ ALL with valeur "*"', async () => {
    const { repo, calls } = client([serve('/search', '56-search-jorf-wide-facets')]);
    await repo.jorfFacets('2024-01-01', '2026-11-12');
    expect(calls[0]?.req.body).toEqual(filterOnly('2024-01-01', '2026-11-12'));
  });

  it('lists natures and emitters by count, without zero counts', async () => {
    const { repo } = client([serve('/search', '56-search-jorf-wide-facets')]);
    const { natures, emitters } = await repo.jorfFacets('2024-01-01', '2026-11-12');
    expect(natures.find((n) => n.value === 'DECRET')).toEqual({ value: 'DECRET', count: 10413 });
    expect(natures).toHaveLength(24);
    expect(emitters).toHaveLength(95);
    expect(emitters.map((e) => e.value)).toContain(
      "Ministère de l'agriculture, de l'agro-alimentaire et de la souveraineté alimentaire",
    );
    for (const f of [...natures, ...emitters]) expect(f.count).toBeGreaterThan(0);
    const sorted = [...natures].sort(
      (a, b) => b.count - a.count || (a.value < b.value ? -1 : a.value > b.value ? 1 : 0),
    );
    expect(natures).toEqual(sorted);
    expect(natures[0]?.value).toBe('ARRETE');
  });

  it('drops zero counts in a filtered answer (fixture 96)', async () => {
    const { repo } = client([serve('/search', '96-search-jorf-emetteur-filter-agri')]);
    const { natures } = await repo.jorfFacets('2026-10-01', '2026-11-12');
    expect(natures).toEqual([
      { value: 'ARRETE', count: 219 },
      { value: 'AVIS', count: 24 },
      { value: 'DECRET', count: 8 },
      { value: 'DECISION', count: 2 },
    ]);
  });

  it('reports a body without facets as an unexpected response', async () => {
    const { repo } = client([{ path: '/search', reply: { results: [] } }]);
    await expect(repo.jorfFacets('2026-10-01', '2026-11-12')).rejects.toMatchObject({
      kind: 'unexpected_response',
    });
  });

  it('forwards the abort signal', async () => {
    const { repo, calls } = client([serve('/search', '94-search-jorf-emetteur-filter')]);
    const signal = new AbortController().signal;
    await repo.jorfFacets('2026-10-01', '2026-11-12', { signal });
    expect(calls[0]?.opts?.signal).toBe(signal);
  });
});
