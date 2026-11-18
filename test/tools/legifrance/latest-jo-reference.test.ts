import { describe, expect, it } from 'vitest';
import { createLegifranceClient } from '../../../src/clients/legifrance/client.js';
import {
  createLatestJo,
  type LatestJoView,
  type ReferenceView,
} from '../../../src/services/legislation/jo.js';
import type { JoIssue, JoText } from '../../../src/services/legislation/ports.js';
import { MAX_TOOL_TEXT } from '../../../src/tools/format.js';
import {
  buildLatestJoAnswer,
  type LatestJoAnswer,
} from '../../../src/tools/legifrance/latest-jo.js';
import { buildReferenceValuesAnswer } from '../../../src/tools/legifrance/reference-values.js';
import { expectAnswer, expectToolError } from '../../helpers/answer.js';
import { type McpTestClient, useServers } from '../../helpers/composed-server.js';
import { fakePisteHttp } from '../../helpers/fake-piste-http.js';

const { composed } = useServers();

type Client = McpTestClient;

/** A client over the composed server on the Légifrance fixtures (today is 2026-11-13). */
function composedClient(now?: () => Date): Promise<Client> {
  return composed({ today: () => '2026-11-13', ...(now !== undefined && { now }) });
}

async function call(name: string, args: Record<string, unknown>, now?: () => Date) {
  const client = await composedClient(now);
  return client.callTool({ name, arguments: args });
}

type Text = { id: string; nature: string | null; emitter: string | null; link: string };

/** Every text of an answer's issues, in order. */
function textsOf(answer: unknown): Text[] {
  const { items } = answer as Pick<LatestJoAnswer, 'items'>;
  return items.flatMap((i) => i.groups.flatMap((g) => g.texts));
}

describe('legifrance_latest_jo (fixture 47)', () => {
  it('default: the latest issue with its publication date, link and JORFTEXT links', async () => {
    const a = expectAnswer(await call('legifrance_latest_jo', {}), {
      source: 'Légifrance',
      outcome: 'results',
    });
    // Fixture 47 holds three issues (it was recorded with nbElement 3), the latest first.
    expect(a.issue_count).toBe(3);
    const issue = a.items[0];
    expect(issue.title).toBe('JORF n°0264 du 11 novembre 2026');
    expect(issue.published).toBe('2026-11-11');
    expect(issue.number).toBe('0264');
    expect(issue.link).toBe('https://www.legifrance.gouv.fr/eli/jo/2026/11/11/0264');
    expect(issue.toc_available).toBe(true);
    // `results` counts the texts over all pages and issues; this page lists some of them.
    expect(a.results).toBeGreaterThanOrEqual(textsOf(a).length);
    for (const t of textsOf(a)) {
      expect(t.link).toBe(`https://www.legifrance.gouv.fr/jorf/id/${t.id}`);
      expect(t.id).toMatch(/^JORFTEXT/);
    }
    expect(a.page.number).toBe(1);
    expect(a.next).toEqual(a.page.of > 1 ? { page: 2 } : null);
    expect(a.filter).toEqual({ nature: null, emitter: null, matched_emitters: [] });
    expect(a.warnings).toEqual([]);
    expect(a.cached).toEqual([]);
    expect(a.request).toEqual({ tool: 'legifrance_latest_jo', count: 1, page: 1 });
  });

  it('count 3 stays under the cap and every page repeats the frame', async () => {
    const first = expectAnswer(await call('legifrance_latest_jo', { count: 3 }), {
      source: 'Légifrance',
      outcome: 'results',
    });
    expect(first.request.count).toBe(3);
    const pages = first.page.of;
    let texts = textsOf(first).length;
    for (let p = 2; p <= pages; p++) {
      const a = expectAnswer(await call('legifrance_latest_jo', { count: 3, page: p }), {
        source: 'Légifrance',
        outcome: 'results',
      });
      expect(a.page).toEqual({ number: p, of: pages });
      expect(a.issue_count).toBe(first.issue_count);
      expect(a.results).toBe(first.results);
      texts += textsOf(a).length;
    }
    expect(texts).toBe(first.results);
  });

  it('nature "decret" keeps only DECRET texts and says so', async () => {
    const a = expectAnswer(await call('legifrance_latest_jo', { nature: 'decret' }), {
      source: 'Légifrance',
      outcome: 'results',
    });
    expect(textsOf(a).length).toBeGreaterThan(0);
    for (const t of textsOf(a)) expect(t.nature).toBe('DECRET');
    expect(a.filter).toEqual({ nature: 'decret', emitter: null, matched_emitters: [] });
    expect(a.results).toBe(textsOf(a).length);
  });

  it('an emitter with no match keeps the issue, says nothing matches and lists the available values', async () => {
    const a = expectAnswer(await call('legifrance_latest_jo', { emitter: 'zzzz-nobody' }), {
      source: 'Légifrance',
      outcome: 'no_results',
    });
    expect(a.items).toHaveLength(a.issue_count);
    expect(a.items[0].title).toBe('JORF n°0264 du 11 novembre 2026');
    expect(a.items[0].published).toBe('2026-11-11');
    for (const issue of a.items) expect(issue.groups).toEqual([]);
    expect(a.results).toBe(0);
    expect(a.warnings[0]).toBe('No text matches these filters in the selected issue(s).');
    expect(a.warnings).toContainEqual(
      expect.stringMatching(/^Natures available in these issues: \S/),
    );
    expect(a.warnings).toContainEqual(
      expect.stringMatching(/^Emitters available in these issues: \S/),
    );
    expect(a.available.natures.length).toBeGreaterThan(0);
    expect(a.available.emitters.length).toBeGreaterThan(0);
    expect(a.available.emitters.length).toBeLessThanOrEqual(10);
    expect(a.filter).toEqual({ nature: null, emitter: 'zzzz-nobody', matched_emitters: [] });
  });

  it('an emitter filter lists the matched spellings', async () => {
    const all = expectAnswer(await call('legifrance_latest_jo', {}), {
      source: 'Légifrance',
      outcome: 'results',
    });
    const ministry = textsOf(all).find((t) => /minist/i.test(t.emitter ?? ''))?.emitter;
    expect(ministry).toBeDefined();
    const word = (ministry ?? '').split(' ').find((w) => w.length > 5) ?? '';
    const a = expectAnswer(await call('legifrance_latest_jo', { emitter: word }), {
      source: 'Légifrance',
      outcome: 'results',
    });
    expect(a.filter.matched_emitters.length).toBeGreaterThan(0);
    expect(a.filter.matched_emitters).toContain(ministry);
  });

  it('a page past the end is no_results, not an error; a bad count is an error', async () => {
    const a = expectAnswer(await call('legifrance_latest_jo', { page: 99 }), {
      source: 'Légifrance',
      outcome: 'no_results',
    });
    expect(a.items).toEqual([]);
    expect(a.results).toBeGreaterThan(0);
    expect(a.page).toEqual({ number: 99, of: expect.any(Number) });
    expect(a.page.of).toBeLessThan(99);
    expect(a.next).toBeNull();
    expect(a.request.page).toBe(99);
    expect(a.available.natures.length).toBeGreaterThan(0);
    // The library rejects it before the tool runs: its own text, not an envelope.
    expect((await call('legifrance_latest_jo', { count: 11 })).isError).toBe(true);
  });
});

function jo(n: number): LatestJoView {
  const texts: JoText[] = Array.from({ length: n }, (_, i) => ({
    id: `JORFTEXT${String(i).padStart(12, '0')}`,
    title: `Arrêté ${'t'.repeat(300)} ${i}`,
    nature: 'ARRETE',
    ministry: 'Ministère',
    emitter: null,
  }));
  const issue: JoIssue = {
    id: 'JORFCONT000000000001',
    title: 'JORF n°0001',
    number: '0001',
    publishedOn: '2026-01-01',
    eliPath: '/eli/jo/2026/01/01/0001',
    groups: [{ path: ['A', 'B'], texts }],
  };
  return {
    issues: [issue],
    filter: { nature: null, emitter: null, matchedEmitters: [] },
    totalTexts: n,
    available: { natures: ['ARRETE'], emitters: ['Ministère'] },
  };
}

/** All pages of a view, one build per requested page as the tool does, following the first's page count. */
function allPages(view: LatestJoView): LatestJoAnswer[] {
  const build = (page: number) =>
    buildLatestJoAnswer(view, { request: { tool: 'legifrance_latest_jo', page }, page });
  const count = build(1).page.of;
  return Array.from({ length: count }, (_, i) => build(i + 1));
}

describe('legifrance_latest_jo, fixture 47 read as production answers count 1', () => {
  // Fixture 47 was recorded with nbElement 3; production answers nbElement 1 with the latest
  // issue only (JORF n°0264, 108 texts): the view is built from that one issue.
  async function latestIssue(): Promise<LatestJoView> {
    const client = createLegifranceClient(
      fakePisteHttp([{ path: '/consult/lastNJo', fixture: '47-lastNJo-3' }]).http,
    );
    const repo = {
      ...client,
      latestJo: async (count: number) => (await client.latestJo(count)).slice(0, count),
    };
    return createLatestJo(repo)({ count: 1 });
  }

  it('splits into pages under the cap, every text once', async () => {
    const view = await latestIssue();
    expect(view.issues.map((i) => i.title)).toEqual(['JORF n°0264 du 11 novembre 2026']);
    expect(view.totalTexts).toBe(108);
    const pages = allPages(view);
    expect(pages.length).toBeGreaterThan(1);
    for (const a of pages) {
      expect(a.outcome).toBe('results');
      expect(a.results).toBe(108);
      expect(JSON.stringify(a).length).toBeLessThanOrEqual(MAX_TOOL_TEXT);
    }
    expect(pages.flatMap((a) => textsOf(a))).toHaveLength(108);
    expect(new Set(pages.flatMap((a) => textsOf(a).map((t) => t.id))).size).toBe(108);
  });
});

describe('buildLatestJoAnswer paging', () => {
  it('a huge issue splits into pages under the cap, each with the issue head and group path, every text once', () => {
    const pages = allPages(jo(900));
    expect(pages.length).toBeGreaterThanOrEqual(10);
    const ids: string[] = [];
    for (const [i, a] of pages.entries()) {
      expect(JSON.stringify(a).length).toBeLessThanOrEqual(MAX_TOOL_TEXT);
      expect(a.page).toEqual({ number: i + 1, of: pages.length });
      expect(a.next).toEqual(i + 1 < pages.length ? { page: i + 2 } : null);
      expect(a.results).toBe(900);
      expect(a.issue_count).toBe(1);
      expect(a.items).toHaveLength(1);
      expect(a.items[0]?.title).toBe('JORF n°0001');
      expect(a.items[0]?.link).toBe('https://www.legifrance.gouv.fr/eli/jo/2026/01/01/0001');
      expect(a.items[0]?.groups).toHaveLength(1);
      expect(a.items[0]?.groups[0]?.path).toEqual(['A', 'B']);
      ids.push(...textsOf(a).map((t) => t.id));
    }
    // Every page was built on its own: the concatenation is every text once, in order.
    expect(ids).toEqual(
      Array.from({ length: 900 }, (_, i) => `JORFTEXT${String(i).padStart(12, '0')}`),
    );
  });

  it('many groups and issues: pages stay under the cap and well filled, every text once, in order', () => {
    const issue = (n: number): JoIssue => ({
      id: `JORFCONT00000000000${n}`,
      title: `JORF n°000${n} du ${n} janvier 2026`,
      number: `000${n}`,
      publishedOn: `2026-01-0${n}`,
      eliPath: `/eli/jo/2026/01/0${n}/000${n}`,
      groups: Array.from({ length: 110 }, (_, g) => ({
        path: [`Ministère ${'m'.repeat(80)} ${g}`, `Direction ${'d'.repeat(80)} ${g}`],
        texts: Array.from({ length: 1 + (g % 4) }, (_, i) => ({
          id: `JORFTEXT${String(n * 10_000 + g * 10 + i).padStart(12, '0')}`,
          title: `Décret ${'t'.repeat(200)} ${n}-${g}-${i}`,
          nature: 'DECRET',
          ministry: `Ministère ${g}`,
          emitter: null,
        })),
      })),
    });
    const issues = [issue(1), issue(2), issue(3)];
    const expectedIds = issues.flatMap((i) =>
      (i.groups ?? []).flatMap((g) => g.texts.map((t) => t.id)),
    );
    const view: LatestJoView = {
      issues,
      filter: {
        nature: 'decret',
        emitter: 'minist',
        matchedEmitters: Array.from({ length: 40 }, (_, i) => `Ministère ${'x'.repeat(90)} ${i}`),
      },
      totalTexts: expectedIds.length,
      available: { natures: ['DECRET'], emitters: [] },
    };
    const pages = allPages(view);
    expect(pages.length).toBeGreaterThanOrEqual(10);
    for (const [i, a] of pages.entries()) {
      const size = JSON.stringify(a).length;
      expect(size).toBeLessThanOrEqual(MAX_TOOL_TEXT);
      if (i < pages.length - 1) expect(size).toBeGreaterThan(MAX_TOOL_TEXT * 0.9);
      expect(a.page).toEqual({ number: i + 1, of: pages.length });
      expect(a.results).toBe(expectedIds.length);
      expect(a.issue_count).toBe(3);
      expect(a.filter.matched_emitters).toHaveLength(40);
      // Every issue on the page is named, and its first group has its path.
      expect(a.items[0]?.title).toMatch(/^JORF n°000\d/);
      expect(a.items[0]?.groups[0]?.path).toHaveLength(2);
    }
    const ids = pages.flatMap((a) => textsOf(a).map((t) => t.id));
    expect(ids).toEqual(expectedIds);
  });

  it("an issue's heading goes with its first text: no page ends on the heading of an issue with texts", () => {
    const texts = (from: number, n: number): JoText[] =>
      Array.from({ length: n }, (_, i) => ({
        id: `JORFTEXT${String(from + i).padStart(12, '0')}`,
        title: `Arrêté ${'t'.repeat(224)} ${from + i}`,
        nature: 'ARRETE',
        ministry: 'Ministère',
        emitter: null,
      }));
    const issue = (n: number, groups: JoIssue['groups']): JoIssue => ({
      id: `JORFCONT00000000000${n}`,
      title: `JORF n°000${n}`,
      number: `000${n}`,
      publishedOn: `2026-01-0${n}`,
      eliPath: `/eli/jo/2026/01/0${n}/000${n}`,
      groups,
    });
    // 101 texts in issue 1 leave room on page 1 for issue 2's heading, not for its first text.
    const issues = [
      issue(1, [{ path: ['A'], texts: texts(0, 101) }]),
      issue(2, [{ path: ['B'], texts: texts(1_000, 3) }]),
      issue(3, null),
    ];
    const view: LatestJoView = {
      issues,
      filter: { nature: null, emitter: null, matchedEmitters: [] },
      totalTexts: 104,
      available: { natures: ['ARRETE'], emitters: ['Ministère'] },
    };
    const pages = allPages(view);
    expect(pages.map((a) => a.items.map((i) => i.title))).toEqual([
      ['JORF n°0001'],
      ['JORF n°0002', 'JORF n°0003'],
    ]);
    for (const a of pages) {
      for (const i of a.items) expect(i.groups.length > 0, i.title).toBe(!i.title.endsWith('3'));
    }
    // An issue without texts keeps its heading on its own.
    expect(pages[1]?.items[1]).toMatchObject({ toc_available: false, groups: [] });
    expect(pages.flatMap((a) => textsOf(a).map((t) => t.id))).toEqual(
      [...texts(0, 101), ...texts(1_000, 3)].map((t) => t.id),
    );
  });

  it('an issue without a table of contents, or with nothing matching, is listed with no groups', () => {
    const view: LatestJoView = {
      issues: [
        {
          id: 'JORFCONT1',
          title: 'JORF n°1',
          number: null,
          publishedOn: null,
          eliPath: null,
          groups: null,
        },
      ],
      filter: { nature: null, emitter: null, matchedEmitters: [] },
      totalTexts: 0,
      available: { natures: [], emitters: [] },
    };
    const a = buildLatestJoAnswer(view, { request: { tool: 'legifrance_latest_jo' }, page: 1 });
    expect(a.outcome).toBe('no_results');
    expect(a.items).toEqual([
      {
        id: 'JORFCONT1',
        number: null,
        title: 'JORF n°1',
        published: null,
        link: null,
        toc_available: false,
        groups: [],
      },
    ]);
    expect(a.warnings).toEqual(['No text is listed in the selected issue(s).']);
  });

  it('no issue at all says so', () => {
    const view: LatestJoView = {
      issues: [],
      filter: { nature: null, emitter: null, matchedEmitters: [] },
      totalTexts: 0,
      available: { natures: [], emitters: [] },
    };
    const a = buildLatestJoAnswer(view, { request: { tool: 'legifrance_latest_jo' }, page: 1 });
    expect(a.outcome).toBe('no_results');
    expect(a.issue_count).toBe(0);
    expect(a.warnings).toEqual(['No Journal officiel issue found.']);
  });

  it('available values are cut to ten, the warning sentence says how many more', () => {
    const issue = { ...(jo(1).issues[0] as JoIssue), groups: [] };
    const view: LatestJoView = {
      issues: [issue],
      filter: { nature: 'loi', emitter: null, matchedEmitters: [] },
      totalTexts: 0,
      available: { natures: Array.from({ length: 12 }, (_, i) => `NATURE${i}`), emitters: [] },
    };
    const a = buildLatestJoAnswer(view, { request: { tool: 'legifrance_latest_jo' }, page: 1 });
    expect(a.outcome).toBe('no_results');
    if (a.outcome !== 'no_results') return;
    expect(a.available.natures).toHaveLength(10);
    expect(a.warnings).toContain(
      `Natures available in these issues: ${Array.from({ length: 10 }, (_, i) => `NATURE${i}`).join('; ')}; … (2 more).`,
    );
  });
});

describe('legifrance_list_reference_values', () => {
  it('codes: title, status and id, with the code list as a cache entry', async () => {
    const a = expectAnswer(await call('legifrance_list_reference_values', { kind: 'codes' }), {
      source: 'Légifrance',
      outcome: 'results',
    });
    expect(a.kind).toBe('codes');
    expect(a.since).toBeNull();
    expect(a.omitted).toBe(0);
    expect(a.results).toBe(a.items.length);
    expect(a.items).toContainEqual({
      value: 'Code civil',
      id: 'LEGITEXT000006070721',
      status: 'in_force',
      count: null,
    });
    expect(a.warnings).toEqual([]);
    expect(a.cached).toEqual([
      { what: 'Légifrance code list', retrieved: expect.stringMatching(/Z$/) },
    ]);
    expect(a.request).toEqual({ tool: 'legifrance_list_reference_values', kind: 'codes' });
  });

  it('jorf_natures: value and count, since a year ago by default, no cache entry', async () => {
    const a = expectAnswer(
      await call('legifrance_list_reference_values', { kind: 'jorf_natures' }),
      { source: 'Légifrance', outcome: 'results' },
    );
    expect(a.since).toBe('2025-11-13');
    expect(a.items).toContainEqual({
      value: 'DECRET',
      id: null,
      status: null,
      count: expect.any(Number),
    });
    expect(a.cached).toEqual([]);
    expect(a.request).toEqual({
      tool: 'legifrance_list_reference_values',
      kind: 'jorf_natures',
      since: '2025-11-13',
    });
  });

  it('jorf_emitters honours since', async () => {
    const a = expectAnswer(
      await call('legifrance_list_reference_values', {
        kind: 'jorf_emitters',
        since: '2026-01-01',
      }),
      { source: 'Légifrance', outcome: 'results' },
    );
    expect(a.since).toBe('2026-01-01');
    expect(a.request.since).toBe('2026-01-01');
    expect(a.items.length).toBeGreaterThan(0);
    for (const v of a.items) expect(v.count).toEqual(expect.any(Number));
  });

  it('a bad kind is rejected by the library, a future since is an error', async () => {
    expect((await call('legifrance_list_reference_values', { kind: 'x' })).isError).toBe(true);
    const e = expectToolError(
      await call('legifrance_list_reference_values', {
        kind: 'jorf_natures',
        since: '2030-01-01',
      }),
      'invalid_input',
    );
    expect(e.request.tool).toBe('legifrance_list_reference_values');
  });

  it('a second codes call within 24 h keeps the first fetch time, earlier than its own retrieved', async () => {
    // The clock advances one minute per reading.
    let t = Date.UTC(2026, 10, 16, 8, 0, 0);
    const client = await composedClient(() => {
      t += 60_000;
      return new Date(t);
    });
    const ask = async () =>
      expectAnswer(
        await client.callTool({
          name: 'legifrance_list_reference_values',
          arguments: { kind: 'codes' },
        }),
        { source: 'Légifrance', outcome: 'results' },
      );
    const first = await ask();
    const second = await ask();
    expect(second.cached[0].retrieved).toBe(first.cached[0].retrieved);
    expect(second.cached[0].retrieved < second.retrieved).toBe(true);
  });

  it('a very long list is cut under the cap and the cut values are counted', () => {
    const view: ReferenceView = {
      kind: 'jorf_emitters',
      since: '2026-01-01',
      fetchedAt: null,
      values: Array.from({ length: 2000 }, (_, i) => ({
        value: `Emitter ${'e'.repeat(50)} ${i}`,
        count: i,
        id: null,
        status: null,
      })),
    };
    const a = buildReferenceValuesAnswer(view, {
      request: { tool: 'legifrance_list_reference_values' },
    });
    expect(JSON.stringify(a).length).toBeLessThanOrEqual(MAX_TOOL_TEXT);
    expect(a.results).toBe(2000);
    expect(a.omitted).toBeGreaterThan(0);
    expect(a.items.length + a.omitted).toBe(2000);
    expect(a.items[0]?.value).toBe(`Emitter ${'e'.repeat(50)} 0`);
    expect(a.items.at(-1)?.value).toBe(`Emitter ${'e'.repeat(50)} ${a.items.length - 1}`);
  });
});
