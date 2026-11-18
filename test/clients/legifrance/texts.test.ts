import { describe, expect, it } from 'vitest';
import { createLegifranceClient } from '../../../src/clients/legifrance/client.js';
import { DEFAULT_TIMEOUT_MS } from '../../../src/clients/piste/http.js';
import type { TextSection } from '../../../src/services/legislation/ports.js';
import { VigueurError } from '../../../src/shared/errors.js';
import { DEFAULT_DEADLINE_MS } from '../../../src/tools/format.js';
import { type FakeRoute, fakePisteHttp, loadFixture } from '../../helpers/fake-piste-http.js';

function client(routes: FakeRoute[]) {
  const fake = fakePisteHttp(routes);
  return { repo: createLegifranceClient(fake.http), calls: fake.calls };
}

const serve = (path: string, fixture: string): FakeRoute => ({ path, fixture });

function countArticles(sections: TextSection[]): number {
  return sections.reduce((n, s) => n + s.articles.length + countArticles(s.sections), 0);
}

const rejected400 = () =>
  new VigueurError(
    'invalid_input',
    `request rejected (HTTP 400): ${JSON.stringify(loadFixture('65-err-lawDecree-unknown'))}`,
  );

describe('getText (LODA)', () => {
  it('gives a whole text more time than a normal request, within the call deadline', async () => {
    const { repo, calls } = client([serve('/consult/lawDecree', '48-lawDecree-loi-78-17')]);
    await repo.getText('LEGITEXT000006068624', '2026-11-12');
    const timeoutMs = calls[0]?.opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    expect(timeoutMs).toBeGreaterThan(DEFAULT_TIMEOUT_MS);
    expect(timeoutMs).toBeLessThan(DEFAULT_DEADLINE_MS);
  });

  it('maps loi 78-17 (fixture 48)', async () => {
    const { repo, calls } = client([serve('/consult/lawDecree', '48-lawDecree-loi-78-17')]);
    const t = await repo.getText('LEGITEXT000006068624', '2026-11-12');
    expect(calls.map((c) => c.req)).toEqual([
      {
        method: 'POST',
        path: '/consult/lawDecree',
        body: { textId: 'LEGITEXT000006068624', date: '2026-11-12' },
      },
    ]);
    if (t === null) throw new Error('expected a text');
    expect(t.id).toBe('LEGITEXT000006068624');
    expect(t.cid).toBe('JORFTEXT000000886460');
    expect(t.title).toContain('Loi n° 78-17 du 6 janvier 1978');
    expect(t.nature).toBe('LOI');
    expect(t.jurisState).toBe('Vigueur');
    expect(t.validFrom).toBe('2026-10-01');
    expect(t.validTo).toBe('2027-11-26');
    expect(t.nota).toBeNull();
    expect(t.visa).not.toBeNull();
    expect(t.visa).not.toMatch(/<[a-z/]/i);
    expect(countArticles(t.sections) + t.articles.length).toBe(187);
  });

  it('orders sections by intOrdre and strips HTML from article text', async () => {
    const { repo } = client([serve('/consult/lawDecree', '48-lawDecree-loi-78-17')]);
    const t = await repo.getText('LEGITEXT000006068624', '2026-11-12');
    if (t === null) throw new Error('expected a text');
    const raw = loadFixture('48-lawDecree-loi-78-17') as {
      sections: Array<{ id: string; intOrdre: number }>;
    };
    const expected = [...raw.sections].sort((a, b) => a.intOrdre - b.intOrdre).map((s) => s.id);
    expect(t.sections.map((s) => s.id)).toEqual(expected);
    const first = (ss: TextSection[]): TextSection['articles'][number] | undefined => {
      for (const s of ss) {
        const a = s.articles[0] ?? first(s.sections);
        if (a) return a;
      }
      return undefined;
    };
    const art = first(t.sections);
    expect(art?.text).toBeTruthy();
    expect(art?.text).not.toMatch(/<[a-z/]/i);
    expect(art?.status).toBe('in_force');
    expect(art?.validToUndetermined).toBe(false);
  });
});

describe('getJorfText and getJorfTextByNor', () => {
  it('maps ordonnance 2016-131 (fixture 50)', async () => {
    const { repo, calls } = client([serve('/consult/jorf', '50-consult-jorf-ord-2016-131')]);
    const t = await repo.getJorfText('JORFTEXT000032004939');
    expect(calls.map((c) => c.req)).toEqual([
      { method: 'POST', path: '/consult/jorf', body: { textCid: 'JORFTEXT000032004939' } },
    ]);
    if (t === null) throw new Error('expected a text');
    expect(t.nor).toBe('JUSC1522466R');
    expect(t.jorfLabel).toContain('JORF n°0035');
    expect(t.cid).toBe('JORFTEXT000032004939');
    expect(t.id).toBe('JORFTEXT000032004939');
    expect(t.publishedOn).toBe('2016-02-11');
    expect(t.signedOn).toBe('2016-02-10');
    expect(t.validFrom).toBeNull();
    expect(t.validTo).toBeNull();
    const articles = [...t.articles];
    const walk = (ss: TextSection[]) =>
      ss.forEach((s) => {
        articles.push(...s.articles);
        walk(s.sections);
      });
    walk(t.sections);
    expect(articles.length).toBeGreaterThan(0);
    for (const a of articles) expect(a.validFrom).toBeNull();
  });

  it('maps getJoWithNor to the same record (fixture 40)', async () => {
    const byCid = await client([
      serve('/consult/jorf', '50-consult-jorf-ord-2016-131'),
    ]).repo.getJorfText('JORFTEXT000032004939');
    const { repo, calls } = client([
      serve('/consult/getJoWithNor', '40-getJoWithNor-ord-2016-131'),
    ]);
    const byNor = await repo.getJorfTextByNor('JUSC1522466R');
    expect(calls.map((c) => c.req)).toEqual([
      { method: 'POST', path: '/consult/getJoWithNor', body: { nor: 'JUSC1522466R' } },
    ]);
    expect(byNor).toEqual(byCid);
  });
});

describe('unknown ids and bad payloads', () => {
  it('answers null for the 400 "L\'expression à valider est fausse."', async () => {
    const routes: FakeRoute[] = [
      { path: '/consult/lawDecree', reply: rejected400() },
      { path: '/consult/jorf', reply: rejected400() },
      { path: '/consult/getJoWithNor', reply: rejected400() },
    ];
    const { repo } = client(routes);
    expect(await repo.getText('LEGITEXT999999999999', '2026-11-12')).toBeNull();
    expect(await repo.getJorfText('JORFTEXT999999999999')).toBeNull();
    expect(await repo.getJorfTextByNor('XXXX0000000X')).toBeNull();
  });

  it('lets any other 400 propagate', async () => {
    const other = new VigueurError(
      'invalid_input',
      'request rejected (HTTP 400): {"message":"Le format de la requête est invalide."}',
    );
    const { repo } = client([{ path: '/consult/lawDecree', reply: other }]);
    await expect(repo.getText('LEGITEXT1', '2026-11-12')).rejects.toBe(other);
  });

  it('reports a malformed body as unexpected_response', async () => {
    const { repo } = client([
      { path: '/consult/lawDecree', reply: { id: 'LEGITEXT1_01-01-2020', sections: 'nope' } },
      { path: '/consult/jorf', reply: [] },
      { path: '/consult/getJoWithNor', reply: { title: 'no id' } },
    ]);
    for (const p of [
      repo.getText('LEGITEXT1', '2026-11-12'),
      repo.getJorfText('JORFTEXT1'),
      repo.getJorfTextByNor('N'),
    ]) {
      const err = await p.then(
        () => undefined,
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(VigueurError);
      expect((err as VigueurError).kind).toBe('unexpected_response');
    }
  });
});

describe('cancellation', () => {
  it('forwards the caller signal', async () => {
    const { signal } = new AbortController();
    const { repo, calls } = client([
      serve('/consult/lawDecree', '48-lawDecree-loi-78-17'),
      serve('/consult/jorf', '50-consult-jorf-ord-2016-131'),
      serve('/consult/getJoWithNor', '40-getJoWithNor-ord-2016-131'),
    ]);
    await repo.getText('LEGITEXT000006068624', '2026-11-12', { signal });
    await repo.getJorfText('JORFTEXT000032004939', { signal });
    await repo.getJorfTextByNor('JUSC1522466R', { signal });
    expect(calls).toHaveLength(3);
    for (const c of calls) expect(c.opts?.signal).toBe(signal);
  });
});
