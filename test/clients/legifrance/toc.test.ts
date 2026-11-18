import { statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createLegifranceClient } from '../../../src/clients/legifrance/client.js';
import { DEFAULT_TIMEOUT_MS } from '../../../src/clients/piste/http.js';
import type { CodeToc, TocArticle, TocNode } from '../../../src/services/legislation/ports.js';
import { VigueurError } from '../../../src/shared/errors.js';
import { DEFAULT_DEADLINE_MS } from '../../../src/tools/format.js';
import { type FakeRoute, fakePisteHttp, loadFixture } from '../../helpers/fake-piste-http.js';

const TRAVAIL = 'LEGITEXT000006072050';
const TOC_PATH = '/consult/legi/tableMatieres';
const TOC_FIXTURE = '20-tableMatieres-code-travail.trimmed-livre-III';
const HOUR = 60 * 60 * 1000;

function client(routes: FakeRoute[], clock: { t: number } = { t: Date.UTC(2026, 10, 12, 12) }) {
  const fake = fakePisteHttp(routes);
  const repo = createLegifranceClient(fake.http, { now: () => new Date(clock.t) });
  return { repo, calls: fake.calls, clock };
}

const tocRoute: FakeRoute = { path: TOC_PATH, fixture: TOC_FIXTURE };

function find(node: TocNode, title: string, depth = 0): { node: TocNode; depth: number } | null {
  if (node.title.startsWith(title)) return { node, depth };
  for (const c of node.children) {
    const f = find(c, title, depth + 1);
    if (f) return f;
  }
  return null;
}

function allArticles(node: TocNode): TocArticle[] {
  return [...node.articles, ...node.children.flatMap(allArticles)];
}

async function rejection(p: Promise<unknown>): Promise<unknown> {
  return p.then(
    () => {
      throw new Error('expected a rejection');
    },
    (e: unknown) => e,
  );
}

describe('getCodeToc', () => {
  it('requests the table of contents of the code as of the date', async () => {
    const { repo, calls } = client([tocRoute]);
    await repo.getCodeToc(TRAVAIL, '2026-11-12');
    expect(calls.map((c) => c.req)).toEqual([
      {
        method: 'POST',
        path: TOC_PATH,
        body: { textId: TRAVAIL, date: '2026-11-12', nature: 'CODE' },
      },
    ]);
  });

  it('gives the large table of contents more time than a normal request, within the call deadline', async () => {
    const { repo, calls } = client([tocRoute]);
    await repo.getCodeToc(TRAVAIL, '2026-11-12');
    const timeoutMs = calls[0]?.opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    expect(timeoutMs).toBeGreaterThan(DEFAULT_TIMEOUT_MS);
    expect(timeoutMs).toBeLessThan(DEFAULT_DEADLINE_MS);
  });

  it('maps the trimmed Code du travail (fixture 20)', async () => {
    const { repo } = client([tocRoute]);
    const toc = await repo.getCodeToc(TRAVAIL, '2026-11-12');
    expect(toc.codeId).toBe(TRAVAIL);
    expect(toc.codeTitle).toBe('Code du travail');
    expect(toc.asOf).toBe('2026-11-12');
    expect(toc.root.title).toBe('Code du travail');
    expect(toc.root.cid).toBe(TRAVAIL);
    const livre = find(toc.root, 'Livre III');
    expect(livre?.depth).toBe(3);
    expect(livre?.node.title).toBe('Livre III : Le règlement intérieur et le droit disciplinaire');
    expect(livre?.node.cid).toBe('LEGISCTA000006145394');
    expect(livre?.node.status).toBe('in_force');
    expect(livre?.node.validFrom).toBe('2008-05-01');
    const arts = allArticles(toc.root);
    expect(arts).toHaveLength(25);
    expect(arts[0]).toEqual({
      id: 'LEGIARTI000006901430',
      cid: 'LEGIARTI000006901430',
      num: 'L1311-1',
      status: 'in_force',
      rawStatus: 'VIGUEUR',
    });
  });

  it('maps an ABROGE article to repealed and keeps the raw status', async () => {
    const raw = loadFixture(TOC_FIXTURE) as { sections: unknown[] };
    const dig = (s: {
      sections?: unknown[];
      articles?: Array<Record<string, unknown>>;
    }): boolean => {
      const a = s.articles?.[0];
      if (a) {
        a.etat = 'ABROGE';
        return true;
      }
      return (s.sections ?? []).some((c) => dig(c as never));
    };
    expect(dig(raw.sections[0] as never)).toBe(true);
    const { repo } = client([{ path: TOC_PATH, reply: raw }]);
    const toc = await repo.getCodeToc(TRAVAIL, '2026-11-12');
    const repealed = allArticles(toc.root).filter((a: TocArticle) => a.status === 'repealed');
    expect(repealed).toHaveLength(1);
    expect(repealed[0]?.rawStatus).toBe('ABROGE');
  });

  it('sorts children and articles by intOrdre', async () => {
    const mk = (id: string, intOrdre: number) => ({
      id,
      cid: id,
      intOrdre,
      etat: 'VIGUEUR',
      title: id,
    });
    const body = {
      cid: TRAVAIL,
      id: `${TRAVAIL}_01-01-2026`,
      title: 'Code X',
      sections: [
        {
          ...mk('LEGISCTA2', 2),
          sections: [mk('LEGISCTA4', 9), mk('LEGISCTA3', 1)],
          articles: [
            { ...mk('LEGIARTI2', 5), num: 'B' },
            { ...mk('LEGIARTI1', 3), num: 'A' },
          ],
        },
        mk('LEGISCTA1', 1),
      ],
    };
    const { repo } = client([{ path: TOC_PATH, reply: body }]);
    const toc = await repo.getCodeToc(TRAVAIL, '2026-11-12');
    expect(toc.root.children.map((c) => c.cid)).toEqual(['LEGISCTA1', 'LEGISCTA2']);
    const second = toc.root.children[1];
    expect(second?.children.map((c) => c.cid)).toEqual(['LEGISCTA3', 'LEGISCTA4']);
    expect(second?.articles.map((a) => a.num)).toEqual(['A', 'B']);
  });

  it('is compact: under 40 % of the fixture size, and holds no raw field', async () => {
    const { repo } = client([tocRoute]);
    const toc = await repo.getCodeToc(TRAVAIL, '2026-11-12');
    const fixtureBytes = statSync(
      join(import.meta.dirname, '..', '..', 'fixtures', 'legifrance', `${TOC_FIXTURE}.json`),
    ).size;
    const compact = JSON.stringify(toc).length;
    expect(compact).toBeLessThan(fixtureBytes * 0.4);
    expect(JSON.stringify(toc)).not.toContain('executionTime');
    expect(JSON.stringify(toc)).not.toContain('intOrdre');
  });

  it('reports a malformed body as an unexpected response', async () => {
    const { repo } = client([{ path: TOC_PATH, reply: { cid: TRAVAIL } }]);
    const err = await rejection(repo.getCodeToc(TRAVAIL, '2026-11-12'));
    expect(err).toBeInstanceOf(VigueurError);
    expect((err as VigueurError).kind).toBe('unexpected_response');
  });

  it('forwards the caller signal', async () => {
    const { signal } = new AbortController();
    const { repo, calls } = client([tocRoute]);
    await repo.getCodeToc(TRAVAIL, '2026-11-12', { signal });
    expect(calls[0]?.opts?.signal).toBe(signal);
  });

  describe('cache', () => {
    it('serves the same (code, date) from memory', async () => {
      const { repo, calls } = client([tocRoute]);
      const a: CodeToc = await repo.getCodeToc(TRAVAIL, '2026-11-12');
      const b = await repo.getCodeToc(TRAVAIL, '2026-11-12');
      expect(calls).toHaveLength(1);
      expect(b).toEqual(a);
    });

    it('stamps the fetch time, the same on every hit until the entry is refetched', async () => {
      const { repo, clock } = client([tocRoute]);
      const fetchedAt = new Date(clock.t);
      const first = await repo.getCodeToc(TRAVAIL, '2026-11-12');
      clock.t += HOUR;
      const hit = await repo.getCodeToc(TRAVAIL, '2026-11-12');
      expect(first.fetchedAt).toEqual(fetchedAt);
      expect(hit.fetchedAt).toEqual(fetchedAt);
      clock.t += 24 * HOUR;
      const refetched = await repo.getCodeToc(TRAVAIL, '2026-11-12');
      expect(refetched.fetchedAt).toEqual(new Date(clock.t));
    });

    it('keys by date as well as by code', async () => {
      const { repo, calls } = client([tocRoute]);
      await repo.getCodeToc(TRAVAIL, '2026-11-12');
      await repo.getCodeToc(TRAVAIL, '2020-01-01');
      expect(calls).toHaveLength(2);
    });

    it('keeps at most 2 entries and evicts the least recently used', async () => {
      const { repo, calls } = client([tocRoute]);
      await repo.getCodeToc('LEGITEXT_A', '2026-11-12');
      await repo.getCodeToc('LEGITEXT_B', '2026-11-12');
      await repo.getCodeToc('LEGITEXT_A', '2026-11-12'); // A is now the most recent
      expect(calls).toHaveLength(2);
      await repo.getCodeToc('LEGITEXT_C', '2026-11-12'); // evicts B
      expect(calls).toHaveLength(3);
      await repo.getCodeToc('LEGITEXT_A', '2026-11-12');
      expect(calls).toHaveLength(3);
      await repo.getCodeToc('LEGITEXT_B', '2026-11-12');
      expect(calls).toHaveLength(4);
    });

    it('evicts the first of three codes', async () => {
      const { repo, calls } = client([tocRoute]);
      for (const id of ['LEGITEXT_A', 'LEGITEXT_B', 'LEGITEXT_C', 'LEGITEXT_A']) {
        await repo.getCodeToc(id, '2026-11-12');
      }
      expect(calls).toHaveLength(4);
    });

    it('refetches an entry older than 24 hours', async () => {
      const { repo, calls, clock } = client([tocRoute]);
      await repo.getCodeToc(TRAVAIL, '2026-11-12');
      clock.t += 24 * HOUR - 1;
      await repo.getCodeToc(TRAVAIL, '2026-11-12');
      expect(calls).toHaveLength(1);
      clock.t += 1;
      await repo.getCodeToc(TRAVAIL, '2026-11-12');
      expect(calls).toHaveLength(2);
    });

    it('does not cache a failed fetch', async () => {
      let fail = true;
      const fake = fakePisteHttp([
        {
          path: TOC_PATH,
          when: () => {
            const was = fail;
            fail = false;
            return was;
          },
          reply: new VigueurError('upstream_unavailable', 'boom'),
        },
        tocRoute,
      ]);
      const repo = createLegifranceClient(fake.http);
      await expect(repo.getCodeToc(TRAVAIL, '2026-11-12')).rejects.toThrow('boom');
      const toc = await repo.getCodeToc(TRAVAIL, '2026-11-12');
      expect(toc.codeTitle).toBe('Code du travail');
      expect(fake.calls).toHaveLength(2);
    });
  });
});

describe('getSectionLinks', () => {
  const SECTION_PATH = '/consult/getSectionByCid';

  it('maps Livre II of the Code du travail (fixture 54)', async () => {
    const { repo, calls } = client([
      { path: SECTION_PATH, fixture: '54-getSectionByCid-travail-livreII' },
    ]);
    const s = await repo.getSectionLinks('LEGISCTA000006145393');
    expect(calls.map((c) => c.req)).toEqual([
      { method: 'POST', path: SECTION_PATH, body: { cid: 'LEGISCTA000006145393' } },
    ]);
    expect(s?.cid).toBe('LEGISCTA000006145393');
    expect(s?.title).toContain('Livre II');
    expect(s?.articles).toEqual([]);
  });

  it('keeps the articles in API order with status and dates (fixture 23)', async () => {
    const { repo } = client([{ path: SECTION_PATH, fixture: '23-getSectionByCid-civ-ch1' }]);
    const raw = loadFixture('23-getSectionByCid-civ-ch1') as {
      listSection: Array<{ cid: string; liensArticle: Array<{ id: string }> }>;
    };
    const s = await repo.getSectionLinks(raw.listSection[0]?.cid ?? '');
    expect(s?.articles.map((a) => a.id)).toEqual(
      (raw.listSection[0]?.liensArticle ?? []).map((a) => a.id),
    );
    expect(s?.articles).toHaveLength(6);
    expect(s?.articles[0]).toEqual({
      id: 'LEGIARTI000032041571',
      status: 'in_force',
      validFrom: '2016-10-01',
      validTo: null,
    });
  });

  it('returns null for a root LEGITEXT (fixture 111)', async () => {
    const { repo } = client([{ path: SECTION_PATH, fixture: '111-getSectionByCid-with-legitext' }]);
    expect(await repo.getSectionLinks(TRAVAIL)).toBeNull();
  });

  it('maps the Partie législative section without articles (fixture 112)', async () => {
    const { repo } = client([
      { path: SECTION_PATH, fixture: '112-getSectionByCid-partie-legislative' },
    ]);
    const s = await repo.getSectionLinks('LEGISCTA000006112874');
    expect(s?.title).toBe('Partie législative');
    expect(s?.articles).toEqual([]);
  });

  it('picks the version valid today in Paris when several exist', async () => {
    const v = (titre: string, dateDebut: number, dateFin: number, id: string) => ({
      cid: 'LEGISCTA1',
      titre,
      dateDebut,
      dateFin,
      liensArticle: [{ id, etat: 'VIGUEUR', dateDebut, dateFin }],
    });
    const body = {
      listSection: [
        v('old', Date.UTC(2000, 0, 1), Date.UTC(2020, 0, 1), 'LEGIARTI_OLD'),
        v('current', Date.UTC(2020, 0, 1), 32472144000000, 'LEGIARTI_NEW'),
      ],
    };
    const { repo } = client([{ path: SECTION_PATH, reply: body }]);
    const s = await repo.getSectionLinks('LEGISCTA1');
    expect(s?.title).toBe('current');
    expect(s?.articles.map((a) => a.id)).toEqual(['LEGIARTI_NEW']);
  });

  it('uses Paris today, not UTC, to pick the version', async () => {
    const day = Date.UTC(2026, 10, 13);
    const body = {
      listSection: [
        {
          cid: 'LEGISCTA1',
          titre: 'before',
          dateDebut: 0,
          dateFin: day - 86_400_000,
          liensArticle: [],
        },
        {
          cid: 'LEGISCTA1',
          titre: 'after',
          dateDebut: day,
          dateFin: 32472144000000,
          liensArticle: [],
        },
      ],
    };
    // 2026-11-12 23:30 UTC is already 2026-11-13 in Paris
    const { repo } = client([{ path: SECTION_PATH, reply: body }], {
      t: Date.UTC(2026, 10, 12, 23, 30),
    });
    expect((await repo.getSectionLinks('LEGISCTA1'))?.title).toBe('after');
  });

  it('picks the new version on the day it replaces the old one, whatever the API order', async () => {
    const day = Date.UTC(2026, 10, 12);
    const oldV = { cid: 'S', titre: 'old', dateDebut: 0, dateFin: day, liensArticle: [] };
    const newV = {
      cid: 'S',
      titre: 'new',
      dateDebut: day,
      dateFin: 32472144000000,
      liensArticle: [],
    };
    for (const listSection of [
      [oldV, newV],
      [newV, oldV],
    ]) {
      const { repo } = client([{ path: SECTION_PATH, reply: { listSection } }]);
      expect((await repo.getSectionLinks('S'))?.title).toBe('new');
    }
  });

  it('forwards the caller signal', async () => {
    const { signal } = new AbortController();
    const { repo, calls } = client([
      { path: SECTION_PATH, fixture: '54-getSectionByCid-travail-livreII' },
    ]);
    await repo.getSectionLinks('LEGISCTA000006145393', { signal });
    expect(calls[0]?.opts?.signal).toBe(signal);
  });
});
