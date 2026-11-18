import { describe, expect, it } from 'vitest';
import type { ChangesView } from '../../../src/services/legislation/changes.js';
import type { ChangeEntry } from '../../../src/services/legislation/ports.js';
import { toolAnswer } from '../../../src/tools/envelope.js';
import {
  buildListChangesAnswer,
  listChangesOutput,
} from '../../../src/tools/legifrance/list-changes.js';
import { expectAnswer, expectToolError } from '../../helpers/answer.js';
import { useServers } from '../../helpers/composed-server.js';

const { composed } = useServers();

async function call(
  name: string,
  args: Record<string, unknown>,
  opts: { today?: () => string } = {},
) {
  const client = await composed(opts);
  const result = await client.callTool({ name, arguments: args });
  return { result };
}

const TODAY = '2026-11-12';
const LEGIFRANCE = 'Légifrance';
const CHANGES = 'legifrance_list_changes';

describe('legifrance_list_changes (fixtures)', () => {
  it('Code civil 2025-2026 lists the amending text and article 61-3-1', async () => {
    const { result } = await call(CHANGES, {
      code: 'Code civil',
      since: '2025-01-01',
      until: '2026-12-31',
    });
    const a = expectAnswer(result, { source: LEGIFRANCE, outcome: 'results' });
    expect(a.target).toBe('code');
    expect(a.title).toBe('Code civil');
    expect(a.since).toBe('2025-01-01');
    expect(a.until).toBe('2026-12-31');
    const group = a.items.find(
      (g: { amended_by: string }) => g.amended_by === 'LOI n°2026-667 du 27 juillet 2026 - art. 7',
    );
    expect(group).toBeDefined();
    expect(group.entries.some((e: { article: string | null }) => e.article === '61-3-1')).toBe(
      true,
    );
    expect(a.results).toBe(
      a.items.reduce((n: number, g: { entries: unknown[] }) => n + g.entries.length, 0),
    );
    expect(a.amending_texts).toBeGreaterThanOrEqual(a.items.length);
  });

  it('text "loi 78-17" lists its changes with entry-into-force dates and the LODA link', async () => {
    const { result } = await call(
      CHANGES,
      { text: 'loi 78-17', since: '2025-01-01', until: '2026-12-31' },
      { today: () => '2026-11-13' },
    );
    const a = expectAnswer(result, { source: LEGIFRANCE, outcome: 'results' });
    expect(a.target).toBe('text');
    expect(a.title).toMatch(/78-17/);
    expect(a.id).toBe('LEGITEXT000006068624');
    expect(a.link).toBe('https://www.legifrance.gouv.fr/loda/id/LEGITEXT000006068624');
    expect(a.request).toEqual({
      tool: CHANGES,
      text: 'loi 78-17',
      since: '2025-01-01',
      until: '2026-12-31',
      page: 1,
    });
    const entry = a.items[0].entries[0];
    expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(['created', 'amended', 'repealed', 'codified']).toContain(entry.action);
    expect(a.warnings.join(' ')).not.toContain('has not loaded the version detail');
  });

  it('until defaults to today in the request', async () => {
    const { result } = await call(
      CHANGES,
      { code: 'Code civil', since: '2025-01-01' },
      { today: () => '2026-11-13' },
    );
    const a = expectAnswer(result, { source: LEGIFRANCE, outcome: 'results' });
    expect(a.request).toEqual({
      tool: CHANGES,
      code: 'Code civil',
      since: '2025-01-01',
      until: '2026-11-13',
      page: 1,
    });
    expect(a.until).toBe('2026-11-13');
  });

  it('a page past the last one is no_results with an empty list', async () => {
    const { result } = await call(CHANGES, {
      code: 'Code civil',
      since: '2025-01-01',
      until: '2026-12-31',
      page: 99,
    });
    const a = expectAnswer(result, { source: LEGIFRANCE, outcome: 'no_results' });
    expect(a.items).toEqual([]);
    expect(a.page.number).toBe(99);
    expect(a.page.number).toBeGreaterThan(a.page.of);
    expect(a.next).toBeNull();
    expect(a.results).toBeGreaterThan(0);
    expect(a.request.page).toBe(99);
  });

  it('code and text together, or neither, is an error', async () => {
    for (const args of [
      { code: 'Code civil', text: 'loi 78-17', since: '2025-01-01' },
      { since: '2025-01-01' },
    ]) {
      const { result } = await call(CHANGES, args);
      const e = expectToolError(result, 'invalid_input');
      expect(e.error.message).toContain('exactly one of');
    }
  });

  it('is titled for codes, laws and decrees alike', async () => {
    const client = await composed();
    const tool = (await client.listTools()).tools.find((t) => t.name === CHANGES);
    expect(tool?.title).toBe('List changes to a French code, law or decree');
  });

  it('has no response_format input (it never changed the answer)', async () => {
    const client = await composed();
    const tool = (await client.listTools()).tools.find((t) => t.name === CHANGES);
    expect(Object.keys(tool?.inputSchema.properties ?? {})).not.toContain('response_format');
  });

  it('a bad date is an error', async () => {
    const { result } = await call(CHANGES, { code: 'Code civil', since: '2025-13-01' });
    expect(result.isError).toBe(true);
  });
});

function syntheticChanges(n: number, groups = 60): ChangesView {
  const entries: ChangeEntry[] = Array.from({ length: n }, (_, i) => ({
    date: i < n - 3 ? '2026-01-01' : '2027-01-01',
    action: 'modification',
    articleNum: `L${1000 + i}-1`,
    articleId: `LEGIARTI${String(i).padStart(12, '0')}`,
    sectionTitle: `Section ${'s'.repeat(120)} ${i}`,
    amendingTitle: `Loi n°${i % groups} ${'t'.repeat(80)}`,
    amendingArticleId: null,
  }));
  const byTitle = new Map<string, ChangeEntry[]>();
  for (const e of entries)
    byTitle.set(e.amendingTitle, [...(byTitle.get(e.amendingTitle) ?? []), e]);
  return {
    target: 'code',
    textTitle: 'Code du travail',
    textId: 'LEGITEXT000006072050',
    since: '2026-01-01',
    until: '2027-12-31',
    groups: [...byTitle].map(([amendingTitle, es]) => ({ amendingTitle, entries: es })),
    scheduledCount: 3,
    undeterminedCount: 2,
    detailMissingYears: ['2027'],
    totalEntries: n,
  };
}

const CHANGES_REQUEST = {
  tool: CHANGES,
  code: 'Code du travail',
  since: '2026-01-01',
  until: '2027-12-31',
  page: 1,
};

/** One page of a change-log answer, through the schema and the envelope. */
function changesPage(view: ChangesView, opts: { page?: number; outcome?: string } = {}) {
  const page = opts.page ?? 1;
  const body = buildListChangesAnswer(view, {
    request: { ...CHANGES_REQUEST, page },
    today: TODAY,
    page,
  });
  return expectAnswer(toolAnswer(listChangesOutput, body, { now: () => new Date() }), {
    source: LEGIFRANCE,
    outcome: opts.outcome ?? 'results',
  });
}

const entryCount = (a: { items?: Array<{ entries: unknown[] }> }) =>
  (a.items ?? []).reduce((n, g) => n + g.entries.length, 0);

describe('list changes paging', () => {
  it('250 entries: page 1 shows 100 and points at page 2, every page under the cap', () => {
    const view = syntheticChanges(250);
    const p1 = changesPage(view);
    expect(entryCount(p1)).toBe(100);
    expect(p1.next).toEqual({ page: 2 });
    expect(p1.results).toBe(250);
    expect(p1.page).toEqual({ number: 1, of: 3 });
    expect(p1.title).toBe('Code du travail');
    expect(p1.target).toBe('code');
    expect(p1.id).toBe('LEGITEXT000006072050');
    expect(p1.link).toBe('https://www.legifrance.gouv.fr/codes/texte_lc/LEGITEXT000006072050');
    expect(p1.amending_texts).toBe(60);
    expect(p1.scheduled).toBe(3);
    expect(p1.undetermined_versions).toBe(2);

    const p3 = changesPage(view, { page: 3 });
    expect(entryCount(p3)).toBe(50);
    expect(p3.next).toBeNull();
    const all = [1, 2, 3].flatMap((page) =>
      changesPage(view, { page }).items.flatMap((g: { entries: unknown[] }) => g.entries),
    );
    expect(all).toHaveLength(250);
    expect(all.filter((e: { scheduled: boolean }) => e.scheduled)).toHaveLength(3);
    expect(p3.warnings).toEqual([
      '2 versions in this range have an entry-into-force date Légifrance leaves undetermined and are not listed.',
      'Légifrance has not loaded the version detail for 2027: changes of that year may be missing.',
    ]);
  });

  it('a group continuing on the next page repeats its amending text', () => {
    const view = syntheticChanges(250, 1);
    const p1 = changesPage(view);
    const p2 = changesPage(view, { page: 2 });
    expect(p1.items).toHaveLength(1);
    expect(p2.items[0].amended_by).toBe(p1.items[0].amended_by);
    expect(p2.amending_texts).toBe(1);
  });

  it('an entry carries its article, section, ids and action', () => {
    const view = syntheticChanges(5);
    const [first] = changesPage(view).items[0].entries;
    expect(first).toEqual({
      date: '2026-01-01',
      action: 'amended',
      article: 'L1000-1',
      section: `Section ${'s'.repeat(120)} 0`,
      article_id: 'LEGIARTI000000000000',
      amending_article_id: null,
      scheduled: false,
    });
  });

  it('the link follows the target and the id: code, LEGITEXT text, JORFTEXT text', () => {
    const base = syntheticChanges(2);
    const at = (target: 'code' | 'text', textId: string) =>
      changesPage({ ...base, target, textId });
    expect(at('code', 'LEGITEXT000006070721').link).toBe(
      'https://www.legifrance.gouv.fr/codes/texte_lc/LEGITEXT000006070721',
    );
    const loda = at('text', 'LEGITEXT000006068624');
    expect(loda.target).toBe('text');
    expect(loda.link).toBe('https://www.legifrance.gouv.fr/loda/id/LEGITEXT000006068624');
    expect(at('text', 'JORFTEXT000000886460').link).toBe(
      'https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000000886460',
    );
  });

  it('past the last page: no_results with the same fields and an empty list', () => {
    const view = syntheticChanges(5);
    const past = changesPage(view, { page: 2, outcome: 'no_results' });
    expect(past.items).toEqual([]);
    expect(past.results).toBe(5);
    expect(past.page).toEqual({ number: 2, of: 1 });
    expect(past.next).toBeNull();
    expect(Object.keys(past)).toEqual(Object.keys(changesPage(view)));
  });

  it('an empty range is no_results on one page', () => {
    const empty = {
      ...syntheticChanges(0),
      groups: [],
      scheduledCount: 0,
      undeterminedCount: 0,
      detailMissingYears: [],
    };
    const a = changesPage(empty, { outcome: 'no_results' });
    expect(a.results).toBe(0);
    expect(a.amending_texts).toBe(0);
    expect(a.page).toEqual({ number: 1, of: 1 });
    expect(a.warnings).toEqual([]);
  });

  it('warnings read in the singular for one version and one year', () => {
    const view = { ...syntheticChanges(2), undeterminedCount: 1 };
    expect(changesPage(view).warnings).toEqual([
      '1 version in this range has an entry-into-force date Légifrance leaves undetermined and is not listed.',
      'Légifrance has not loaded the version detail for 2027: changes of that year may be missing.',
    ]);
  });

  it('every page stays under the cap even with huge titles', () => {
    const view = syntheticChanges(300, 300);
    for (const g of view.groups) g.amendingTitle = 'T'.repeat(600);
    const pages = changesPage(view).page.of;
    expect(pages).toBeGreaterThan(3);
    let entries = 0;
    for (let page = 1; page <= pages; page++) entries += entryCount(changesPage(view, { page }));
    expect(entries).toBe(300);
  });
});

/** Entries whose sections have uneven lengths, so page edges fall at many different offsets. */
function unevenChanges(n: number, base = 2_500): ChangesView {
  const view = syntheticChanges(n, 7);
  let i = 0;
  for (const g of view.groups) {
    for (const e of g.entries) {
      e.sectionTitle = `S${i} ${'s'.repeat(base + ((i * 37) % 211))}`;
      i += 1;
    }
  }
  return view;
}

describe('list changes: page splits do not depend on the page asked', () => {
  it('reading pages 1..N one call each gives every entry once, in order', () => {
    // Entry sizes picked so a page edge falls where the page number's width would move it
    // (they fail when the frame is measured with the requested page number).
    for (const base of [2_508, 2_522, 2_529]) {
      const view = unevenChanges(400, base);
      const expected = view.groups.flatMap((g) => g.entries.map((e) => e.articleId));
      const readPage = (page: number) =>
        buildListChangesAnswer(view, { request: { ...CHANGES_REQUEST, page }, today: TODAY, page });
      const pages = readPage(1).page.of;
      expect(pages).toBeGreaterThanOrEqual(10);
      const seen: Array<string | null> = [];
      for (let page = 1; page <= pages; page++) {
        for (const g of readPage(page).items) {
          for (const e of g.entries) seen.push(e.article_id);
        }
      }
      expect(seen, `entry size ${base}`).toEqual(expected);
    }
  });
});
