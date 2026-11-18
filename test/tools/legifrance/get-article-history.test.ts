import { describe, expect, it } from 'vitest';
import type { ArticleHistoryView } from '../../../src/services/legislation/history.js';
import type { HistoryEntry } from '../../../src/services/legislation/ports.js';
import { toolAnswer } from '../../../src/tools/envelope.js';
import {
  buildGetArticleHistoryAnswer,
  getArticleHistoryOutput,
} from '../../../src/tools/legifrance/get-article-history.js';
import { expectAnswer } from '../../helpers/answer.js';
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
const HISTORY = 'legifrance_get_article_history';
const LEGIFRANCE = 'Légifrance';

describe('legifrance_get_article_history (fixtures)', () => {
  it('Code civil 1382: versions, amending text, concordance to 1240', async () => {
    const { result } = await call(
      HISTORY,
      { code: 'Code civil', number: '1382' },
      { today: () => TODAY },
    );
    const a = expectAnswer(result, { source: LEGIFRANCE, outcome: 'found' });
    expect(a.code).toBe('Code civil');
    expect(a.number).toBe('1382');
    expect(a.on).toBe(TODAY);
    expect(a.versions).toEqual([
      expect.objectContaining({
        version: '1.0',
        legifrance_status: 'MODIFIE',
        from: '1804-03-21',
        until: '2016-10-01',
        until_undetermined: false,
      }),
      expect.objectContaining({
        version: '2.0',
        legifrance_status: 'VIGUEUR',
        from: '2016-10-01',
        until: null,
        until_undetermined: false,
      }),
    ]);
    expect(a.current).toMatchObject({ version: '2.0', from: '2016-10-01', until: null });
    expect(a.items).toContainEqual({
      date: '2016-10-01',
      date_undetermined: false,
      action: 'amended',
      by: 'Ordonnance n°2016-131 du 10 février 2016 - art. 4',
      by_article_id: null,
      scheduled: false,
    });
    expect(a.results).toBe(a.items.length);
    expect(a.page).toEqual({ number: 1, of: 1 });
    expect(a.next).toBeNull();
    // The 1240 link belongs to version 1.0 (the tort text), not to the article as a whole.
    expect(a.concordance).toEqual({
      moved: [
        {
          version: '1.0',
          from: '1804-03-21',
          until: '2016-10-01',
          to: ['Code civil - art. 1240 (V)'],
        },
      ],
      came_from: ['Code civil - art. 1353 (M)'],
    });
    expect(JSON.stringify(a).match(/art\. 1240/g)).toHaveLength(1);
    expect(a.warnings).toEqual([]);
    expect(a.link).toMatch(/^https:\/\/www\.legifrance\.gouv\.fr\/codes\/article_lc\/LEGIARTI/);
    expect(a.request).toEqual({
      tool: HISTORY,
      code: 'Code civil',
      number: '1382',
      page: 1,
      response_format: 'concise',
    });
  });

  it('a page past the last one is no_results, not an error', async () => {
    const { result } = await call(HISTORY, { code: 'Code civil', number: '1382', page: 99 });
    const a = expectAnswer(result, { source: LEGIFRANCE, outcome: 'no_results' });
    expect(a.items).toEqual([]);
    expect(a.page.number).toBe(99);
    expect(a.page.number).toBeGreaterThan(a.page.of);
    expect(a.next).toBeNull();
    expect(a.results).toBeGreaterThan(0);
    expect(a.versions.length).toBeGreaterThan(0);
    expect(a.request.page).toBe(99);
  });

  it('an ambiguous citation answers like get_article', async () => {
    const { result } = await call(HISTORY, { number: 'L1234-1' });
    const a = expectAnswer(result, { source: LEGIFRANCE, outcome: 'several_matches' });
    expect(a.warnings).toContain(
      'Article L1234-1 exists in several codes — call again with "code".',
    );
    expect(a.candidates.length).toBeGreaterThan(1);
    for (const c of a.candidates) {
      expect(c.read_with).toEqual({ tool: 'legifrance_get_article', id: c.id });
    }
  });

  it('an unknown code answers like get_article', async () => {
    const { result } = await call(HISTORY, { code: 'C. route', number: 'R413-17' });
    const a = expectAnswer(result, { source: LEGIFRANCE, outcome: 'not_found' });
    expect(a.reason).toBe('unknown_code');
    expect(a.warnings[0]).toContain('Unknown code "C. route": no Légifrance code has this title.');
  });

  it('blank inputs count as absent', async () => {
    const { result } = await call(HISTORY, { code: ' ', number: 'L1234-1', id: '' });
    const a = expectAnswer(result, { source: LEGIFRANCE, outcome: 'several_matches' });
    expect(a.warnings[0]).toContain('exists in several codes');
    expect(a.request).toEqual({
      tool: HISTORY,
      number: 'L1234-1',
      page: 1,
      response_format: 'concise',
    });
  });

  it('declares an output schema', async () => {
    const client = await composed();
    const tool = (await client.listTools()).tools.find((t) => t.name === HISTORY);
    expect(tool?.outputSchema?.type).toBe('object');
  });
});

function syntheticHistory(events: number): ArticleHistoryView {
  const list: HistoryEntry[] = Array.from({ length: events }, (_, i) => ({
    date: i === 0 ? null : '2020-01-01',
    undetermined: i === 0,
    action: 'modification',
    amendingTitle: `Loi n°${i} ${'t'.repeat(40)}`,
    amendingArticleId: null,
  }));
  return {
    kind: 'history',
    codeTitle: 'Code civil',
    num: '1',
    current: {
      id: 'LEGIARTI000000000001',
      version: '3.0',
      status: 'in_force',
      rawStatus: 'VIGUEUR',
      validFrom: '2020-01-01',
      validTo: null,
      validToUndetermined: false,
    },
    versions: [
      {
        id: 'LEGIARTI000000000001',
        version: '3.0',
        status: 'in_force',
        rawStatus: 'VIGUEUR',
        validFrom: '2020-01-01',
        validTo: null,
        validToUndetermined: false,
      },
    ],
    events: list,
    concordance: {
      from: [],
      moved: [
        {
          version: {
            id: 'LEGIARTI000000000001',
            version: '3.0',
            status: 'in_force',
            rawStatus: 'VIGUEUR',
            validFrom: '2020-01-01',
            validTo: null,
            validToUndetermined: false,
          },
          to: [
            {
              id: 'LEGIARTI000000000002',
              num: '2',
              codeTitle: 'Code civil',
              label: 'Code civil, art. 2',
            },
          ],
        },
      ],
    },
    warnings: [],
  };
}

const HISTORY_REQUEST = {
  tool: HISTORY,
  code: 'Code civil',
  number: '1',
  page: 1,
  response_format: 'concise',
};

/** One page of a history answer, through the schema and the envelope. */
function historyPage(
  result: Parameters<typeof buildGetArticleHistoryAnswer>[0],
  opts: { page?: number; detailed?: boolean; outcome?: string } = {},
) {
  const page = opts.page ?? 1;
  const body = buildGetArticleHistoryAnswer(result, {
    detailed: opts.detailed ?? false,
    today: TODAY,
    requestedId: null,
    page,
    request: { ...HISTORY_REQUEST, page },
  });
  return expectAnswer(toolAnswer(getArticleHistoryOutput, body, { now: () => new Date() }), {
    source: LEGIFRANCE,
    outcome: opts.outcome ?? 'found',
  });
}

describe('article history paging', () => {
  it('500 events: pages of at most 100, each self-describing and under the cap', () => {
    const view = syntheticHistory(500);
    const p1 = historyPage(view, { page: 1 });
    expect(p1.items).toHaveLength(100);
    expect(p1.next).toEqual({ page: 2 });
    expect(p1.items[0]).toEqual({
      date: null,
      date_undetermined: true,
      action: 'amended',
      by: `Loi n°0 ${'t'.repeat(40)}`,
      by_article_id: null,
      scheduled: false,
    });
    expect(p1.concordance).toEqual({
      moved: [{ version: '3.0', from: '2020-01-01', until: null, to: ['Code civil, art. 2'] }],
      came_from: [],
    });
    expect(p1.results).toBe(500);
    expect(p1.page).toEqual({ number: 1, of: 5 });

    const p5 = historyPage(view, { page: 5 });
    expect(p5.next).toBeNull();
    expect(p5.items).toHaveLength(100);
    expect(p5.link).toBe('https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000000000001');
    expect(p5.versions).toHaveLength(1);
    expect(p5.concordance).toEqual(p1.concordance);
  });

  it('reading pages 1..N one call each gives every event once, in order', () => {
    // Event sizes picked so a page edge falls where the page number's width would move it
    // (they fail when the frame is measured with the requested page number).
    for (const base of [2_560, 2_568, 2_581]) {
      const view = syntheticHistory(400);
      view.events.forEach((e, i) => {
        e.amendingTitle = `E${i} ${'t'.repeat(base + ((i * 37) % 211))}`;
      });
      const expected = view.events.map((_, i) => `E${i}`);
      const readPage = (page: number) =>
        buildGetArticleHistoryAnswer(view, {
          detailed: false,
          today: TODAY,
          requestedId: null,
          page,
          request: { ...HISTORY_REQUEST, page },
        }) as ReturnType<typeof historyPage>;
      const pages = readPage(1).page.of;
      expect(pages).toBeGreaterThanOrEqual(10);
      const seen: string[] = [];
      for (let page = 1; page <= pages; page++) {
        for (const item of readPage(page).items) seen.push(item.by.split(' ')[0] ?? '');
      }
      expect(seen, `event size ${base}`).toEqual(expected);
    }
  });

  it('past the last page: no_results with the same fields and an empty list', () => {
    const view = syntheticHistory(500);
    const p6 = historyPage(view, { page: 6, outcome: 'no_results' });
    expect(p6.items).toEqual([]);
    expect(p6.page).toEqual({ number: 6, of: 5 });
    expect(p6.next).toBeNull();
    expect(p6.results).toBe(500);
    expect(Object.keys(p6)).toEqual(Object.keys(historyPage(view)));
  });

  it('no events: one page with an empty list', () => {
    const a = historyPage({ ...syntheticHistory(1), events: [] });
    expect(a.results).toBe(0);
    expect(a.items).toEqual([]);
    expect(a.page).toEqual({ number: 1, of: 1 });
  });

  it('shows the end of the current version, including an undetermined one', () => {
    const open = historyPage(syntheticHistory(1));
    expect(open.on).toBe(TODAY);
    expect(open.current).toEqual({
      id: 'LEGIARTI000000000001',
      version: '3.0',
      from: '2020-01-01',
      until: null,
      until_undetermined: false,
    });
    const view = syntheticHistory(1);
    const pending = {
      ...view.versions[0],
      id: 'LEGIARTI000000000001',
      version: '3.0',
      status: 'repeal_pending' as const,
      rawStatus: 'ABROGE_DIFF',
      validFrom: '2020-01-01',
      validTo: null,
      validToUndetermined: true,
    };
    const a = historyPage({ ...view, current: pending, versions: [pending] });
    expect(a.current).toEqual({
      id: 'LEGIARTI000000000001',
      version: '3.0',
      from: '2020-01-01',
      until: null,
      until_undetermined: true,
    });
    expect(a.versions).toEqual([
      {
        id: 'LEGIARTI000000000001',
        version: '3.0',
        legifrance_status: 'ABROGE_DIFF',
        from: '2020-01-01',
        until: null,
        until_undetermined: true,
      },
    ]);
  });

  it('no version in force today: current is null, the link is the latest version', () => {
    const view = syntheticHistory(1);
    const a = historyPage({ ...view, current: null });
    expect(a.current).toBeNull();
    expect(a.link).toBe('https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000000000001');
    expect(historyPage({ ...view, current: null, versions: [] }).link).toBeNull();
  });

  it('events: every action, scheduled after today, and the amending article id when detailed', () => {
    const view = syntheticHistory(1);
    const event = (action: HistoryEntry['action'], date: string) => ({
      date,
      undetermined: false,
      action,
      amendingTitle: `Texte ${action}`,
      amendingArticleId: 'LEGIARTI000000000777',
    });
    const events: HistoryEntry[] = [
      event('creation', '2000-01-01'),
      event('modification', '2010-01-01'),
      event('abrogation', '2027-01-01'),
      event('codification', '2001-01-01'),
      event('transfer', '2002-01-01'),
      event('other', '2003-01-01'),
    ];
    const concise = historyPage({ ...view, events });
    expect(concise.items.map((e: Record<string, unknown>) => e.action)).toEqual([
      'created',
      'amended',
      'repealed',
      'codified',
      'transferred',
      'linked',
    ]);
    expect(concise.items.map((e: Record<string, unknown>) => e.scheduled)).toEqual([
      false,
      false,
      true,
      false,
      false,
      false,
    ]);
    expect(concise.items.every((e: Record<string, unknown>) => e.by_article_id === null)).toBe(
      true,
    );
    const detailed = historyPage({ ...view, events }, { detailed: true });
    expect(detailed.items[2]).toEqual({
      date: '2027-01-01',
      date_undetermined: false,
      action: 'repealed',
      by: 'Texte abrogation',
      by_article_id: 'LEGIARTI000000000777',
      scheduled: true,
    });
  });

  it('scopes each concordance entry to the version it describes (Code civil 1240)', () => {
    const version = (id: string, v: string, from: string, to: string | null) => ({
      id,
      version: v,
      status: to === null ? ('in_force' as const) : ('amended' as const),
      rawStatus: to === null ? 'VIGUEUR' : 'MODIFIE',
      validFrom: from,
      validTo: to,
      validToUndetermined: false,
    });
    const payment = version('LEGIARTI000006437044', '1.0', '1804-03-21', '2016-10-01');
    const tort = version('LEGIARTI000032041571', '2.0', '2016-10-01', null);
    const civ = (id: string, num: string, flag: string) => ({
      id,
      num,
      codeTitle: 'Code civil',
      label: `Code civil - art. ${num} (${flag})`,
    });
    const view: ArticleHistoryView = {
      kind: 'history',
      codeTitle: 'Code civil',
      num: '1240',
      current: tort,
      versions: [payment, tort],
      events: [],
      concordance: {
        from: [civ('LEGIARTI000006438819', '1382', 'M')],
        moved: [{ version: payment, to: [civ('LEGIARTI000032035241', '1342-3', 'V')] }],
      },
      warnings: [],
    };
    expect(historyPage(view).concordance).toEqual({
      moved: [
        {
          version: '1.0',
          from: '1804-03-21',
          until: '2016-10-01',
          to: ['Code civil - art. 1342-3 (V)'],
        },
      ],
      came_from: ['Code civil - art. 1382 (M)'],
    });
  });

  it('shows the warnings of a partial answer', () => {
    const view = {
      ...syntheticHistory(1),
      warnings: ["Could not read Légifrance's concordance of LEGIARTI000000000001 (fetch failed)."],
    };
    expect(historyPage(view).warnings).toEqual([
      "Could not read Légifrance's concordance of LEGIARTI000000000001 (fetch failed).",
    ]);
  });

  it('events whose entries are very long page by size, not only by count', () => {
    const view = syntheticHistory(100);
    for (const e of view.events) e.amendingTitle = 'z'.repeat(3_000);
    // expectAnswer bounds the page by MAX_TOOL_TEXT.
    const p1 = historyPage(view);
    expect(p1.items.length).toBeLessThan(100);
    expect(p1.next).toEqual({ page: 2 });
    const items = [...p1.items];
    for (let page = p1.next.page; page !== undefined; ) {
      const p = historyPage(view, { page });
      items.push(...p.items);
      page = p.next?.page;
    }
    expect(items).toHaveLength(100);
  });
});
