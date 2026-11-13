import { describe, expect, it } from 'vitest';
import { createBrowseCode } from '../../../src/services/legislation/browse.js';
import { createGetArticle } from '../../../src/services/legislation/get-article.js';
import type {
  CodeToc,
  SectionLinks,
  TocArticle,
  TocNode,
} from '../../../src/services/legislation/ports.js';
import { VigueurError } from '../../../src/shared/errors.js';
import { fakeLegislation, makeArticle } from '../../helpers/fake-legislation.js';

const TODAY = '2026-11-12';
const CODE_ID = 'LEGITEXT000006070721';

const art = (id: string, num: string, status: TocArticle['status'] = 'in_force'): TocArticle => ({
  id,
  cid: id,
  num,
  status,
  rawStatus: status === 'in_force' ? 'VIGUEUR' : 'ABROGE',
});

const node = (cid: string, title: string, rest: Partial<TocNode> = {}): TocNode => ({
  cid,
  title,
  status: 'in_force',
  validFrom: '2000-01-01',
  validTo: null,
  children: [],
  articles: [],
  ...rest,
});

const chapitre = node('LEGISCTA000000000003', 'Chapitre I', {
  articles: [
    art('LEGIARTI000000000001', '1'),
    art('LEGIARTI000000000002', '2', 'repealed'),
    art('LEGIARTI000000000003', '3'),
  ],
  children: [
    node('LEGISCTA000000000004', 'Section 1'),
    node('LEGISCTA000000000005', 'Section ancienne', { status: 'repealed', validTo: '2010-01-01' }),
    node('LEGISCTA000000000006', 'Section abrogée sans date', { status: 'repealed' }),
  ],
});
const livre1 = node('LEGISCTA000000000002', 'Livre I', { children: [chapitre] });
const livre2 = node('LEGISCTA000000000007', 'Livre II', { validTo: '2020-01-01' });
const TOC: CodeToc = {
  codeId: CODE_ID,
  codeTitle: 'Code civil',
  asOf: TODAY,
  // The root carries the consolidated version's bounds, never in-force dates.
  root: node(CODE_ID, 'Code civil', {
    validFrom: '2026-11-01',
    validTo: '2999-01-01',
    children: [livre1, livre2],
  }),
};

const browse = (extra: Parameters<typeof fakeLegislation>[0] = {}) => {
  const { repo, calls } = fakeLegislation({ tocs: { [CODE_ID]: TOC }, ...extra });
  return { run: createBrowseCode(repo, { today: () => TODAY }), calls };
};

describe('browse a code', () => {
  it('lists the top-level parts valid today, never filtering the root itself', async () => {
    const view = await browse().run({ code: 'Code civil' });
    expect(view.node).toBeNull();
    expect(view.breadcrumb).toEqual([]);
    expect(view.children.map((c) => c.cid)).toEqual(['LEGISCTA000000000002']);
    expect(view.codeId).toBe(CODE_ID);
    expect(view.asOf).toBe(TODAY);
  });

  it('shows a section with its breadcrumb from the root, children and articles', async () => {
    const view = await browse().run({ code: 'Code civil', sectionCid: chapitre.cid });
    expect(view.breadcrumb).toEqual([
      { cid: livre1.cid, title: 'Livre I' },
      { cid: chapitre.cid, title: 'Chapitre I' },
    ]);
    expect(view.node).toEqual({ cid: chapitre.cid, title: 'Chapitre I' });
    expect(view.children.map((c) => c.title)).toEqual(['Section 1']);
    expect(view.articles.map((a) => a.num)).toEqual(['1', '3']);
  });

  it('hides repealed articles and sections by default and counts them', async () => {
    const view = await browse().run({ code: 'Code civil', sectionCid: chapitre.cid });
    expect(view.hiddenRepealed).toBe(2); // the repealed article + the repealed undated section
  });

  it('shows repealed content with includeRepealed', async () => {
    const view = await browse().run({
      code: 'Code civil',
      sectionCid: chapitre.cid,
      includeRepealed: true,
    });
    expect(view.articles.map((a) => a.num)).toEqual(['1', '2', '3']);
    expect(view.articles[1]?.status).toBe('repealed');
    expect(view.children.map((c) => c.title)).toEqual(['Section 1', 'Section abrogée sans date']);
    expect(view.hiddenRepealed).toBe(0);
  });

  it('hides a node valid only before the date, and shows it on an earlier date', async () => {
    const { run, calls } = browse();
    const now = await run({ code: 'Code civil' });
    expect(now.children.map((c) => c.title)).not.toContain('Livre II');
    const before = await run({ code: 'Code civil', atDate: '2015-06-01' });
    expect(before.children.map((c) => c.title)).toContain('Livre II');
    expect(calls.getCodeToc.at(-1)?.args).toEqual([CODE_ID, '2015-06-01']);
  });

  it('never mutates the shared cached table', async () => {
    const snapshot = structuredClone(TOC);
    await browse().run({ code: 'Code civil', sectionCid: chapitre.cid });
    expect(TOC).toEqual(snapshot);
  });

  it('rejects an unknown section with invalid_input', async () => {
    await expect(browse().run({ code: 'Code civil', sectionCid: 'LEGISCTA999' })).rejects.toThrow(
      expect.objectContaining({ kind: 'invalid_input' }),
    );
  });

  it('rejects an unknown code with suggestions', async () => {
    const error = await browse()
      .run({ code: 'Code du trav' })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(VigueurError);
    expect((error as VigueurError).kind).toBe('invalid_input');
    expect((error as VigueurError).message).toContain('Code du travail');
  });
});

describe('article neighbours', () => {
  const SECTION = 'LEGISCTA000000000010';
  const ids = ['LEGIARTI000000000101', 'LEGIARTI000000000102', 'LEGIARTI000000000103'];
  const links: SectionLinks = {
    cid: SECTION,
    title: 'Section',
    articles: [
      ...ids.map((id) => ({
        id,
        status: 'in_force' as const,
        validFrom: '2000-01-01' as const,
        validTo: null,
      })),
      {
        id: 'LEGIARTI000000000100',
        status: 'repealed' as const,
        validFrom: '1990-01-01' as const,
        validTo: '2000-01-01' as const,
      },
    ],
  };
  const articles = ids.map((id, i) =>
    makeArticle({
      id,
      num: `10${i + 1}`,
      sectionCid: SECTION,
      text: `${i === 2 ? 'x'.repeat(300) : `Texte ${i + 1}`}`,
    }),
  );
  const setup = (overrides = {}) => {
    const { repo, calls } = fakeLegislation({
      articles,
      sectionLinks: { [SECTION]: links },
      overrides,
    });
    return { get: createGetArticle(repo, { today: () => TODAY }), calls };
  };

  it('gives both neighbours of a middle article', async () => {
    const { get, calls } = setup();
    const r = await get({ id: ids[1] as string, includeNeighbours: true });
    if (r.kind !== 'found') throw new Error('expected found');
    expect(r.article.neighbours?.previous).toMatchObject({ id: ids[0], num: '101' });
    expect(r.article.neighbours?.next?.id).toBe(ids[2]);
    expect(r.article.neighbours?.next?.excerpt).toHaveLength(200);
    expect(r.article.neighbours?.previous?.url).toContain(ids[0] as string);
    expect(calls.getSectionLinks).toHaveLength(1);
  });

  it('gives previous: null for the first valid article (a repealed link is skipped)', async () => {
    const { get } = setup();
    const r = await get({ id: ids[0] as string, includeNeighbours: true });
    if (r.kind !== 'found') throw new Error('expected found');
    expect(r.article.neighbours?.previous).toBeNull();
    expect(r.article.neighbours?.next?.id).toBe(ids[1]);
  });

  it('does not touch the section when neighbours are not asked for', async () => {
    const { get, calls } = setup();
    const r = await get({ id: ids[1] as string });
    if (r.kind !== 'found') throw new Error('expected found');
    expect(r.article.neighbours).toBeUndefined();
    expect(calls.getSectionLinks).toHaveLength(0);
  });

  it('a failing neighbour read becomes null plus a warning', async () => {
    const { repo } = fakeLegislation({ articles, sectionLinks: { [SECTION]: links } });
    const get = createGetArticle(
      {
        ...repo,
        getArticle: async (id, asOf, ctx) => {
          if (id === ids[2]) throw new VigueurError('upstream_unavailable', 'boom');
          return repo.getArticle(id, asOf, ctx);
        },
      },
      { today: () => TODAY },
    );
    const r = await get({ id: ids[1] as string, includeNeighbours: true });
    if (r.kind !== 'found') throw new Error('expected found');
    expect(r.article.neighbours?.next).toBeNull();
    expect(r.article.neighbours?.previous?.id).toBe(ids[0]);
    expect(r.article.warnings.join(' ')).toContain('boom');
  });

  it('a cancelled neighbour read cancels the lookup', async () => {
    const cancelled = new VigueurError('cancelled', 'Légifrance: request cancelled.');
    const { repo } = fakeLegislation({ articles, sectionLinks: { [SECTION]: links } });
    const get = createGetArticle(
      {
        ...repo,
        getArticle: async (id, asOf, ctx) => {
          if (id === ids[2]) throw cancelled;
          return repo.getArticle(id, asOf, ctx);
        },
      },
      { today: () => TODAY },
    );
    await expect(get({ id: ids[1] as string, includeNeighbours: true })).rejects.toBe(cancelled);
  });

  it('no section, or an article absent from it: both null with a warning', async () => {
    const orphan = makeArticle({ id: 'LEGIARTI000000000200', num: '200', sectionCid: null });
    const lost = makeArticle({ id: 'LEGIARTI000000000201', num: '201', sectionCid: SECTION });
    const { repo } = fakeLegislation({
      articles: [orphan, lost],
      sectionLinks: { [SECTION]: links },
    });
    const get = createGetArticle(repo, { today: () => TODAY });
    for (const id of [orphan.version.id, lost.version.id]) {
      const r = await get({ id, includeNeighbours: true });
      if (r.kind !== 'found') throw new Error('expected found');
      expect(r.article.neighbours).toEqual({ previous: null, next: null });
      expect(r.article.warnings.join(' ')).toMatch(/neighbour/i);
    }
  });
});
