import { afterEach, describe, expect, it } from 'vitest';
import { compose } from '../../../src/compose.js';
import type { ChangesView } from '../../../src/services/legislation/changes.js';
import type { ArticleHistoryView } from '../../../src/services/legislation/history.js';
import type {
  ChangeEntry,
  HistoryEntry,
  LegislationHit,
  LegislationSearchPage,
} from '../../../src/services/legislation/ports.js';
import { toolAnswer } from '../../../src/tools/envelope.js';
import { MAX_TOOL_TEXT } from '../../../src/tools/format.js';
import {
  buildGetArticleHistoryAnswer,
  getArticleHistoryOutput,
} from '../../../src/tools/legifrance/get-article-history.js';
import { renderListChanges } from '../../../src/tools/legifrance/list-changes.js';
import { askedLine, renderSearch } from '../../../src/tools/legifrance/search-legislation.js';
import { expectAnswer } from '../../helpers/answer.js';
import { fixtureFetch, sandboxConfig } from '../../helpers/fixture-fetch.js';
import { connectClient, firstText } from '../../helpers/mcp-client.js';

let cleanup: Array<() => Promise<void>> = [];
let unmatchedRoutes: string[][] = [];

afterEach(async () => {
  for (const close of cleanup.reverse()) await close();
  cleanup = [];
  // Reset before asserting, so one test's unmatched request never fails the next ones.
  const pending = unmatchedRoutes;
  unmatchedRoutes = [];
  for (const unmatched of pending) expect(unmatched, 'requests without a fixture').toEqual([]);
});

async function connectOnly(opts: { today?: () => string } = {}) {
  const fixtures = fixtureFetch();
  unmatchedRoutes.push(fixtures.unmatched);
  const { client, close } = await connectClient(
    compose(sandboxConfig(), { fetch: fixtures.fetch, ...opts }),
  );
  cleanup.push(close);
  return { client };
}

async function call(
  name: string,
  args: Record<string, unknown>,
  opts: { today?: () => string } = {},
) {
  const { client } = await connectOnly(opts);
  const result = await client.callTool({ name, arguments: args });
  return { result, text: firstText(result) };
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
      'Article L1234-1 exists in several codes — call again with "code":',
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
    const { client } = await connectOnly();
    const tool = (await client.listTools()).tools.find((t) => t.name === HISTORY);
    expect(tool?.outputSchema?.type).toBe('object');
  });
});

const hit = (n: number): LegislationHit => ({
  kind: 'article',
  id: `LEGIARTI${String(n).padStart(12, '0')}`,
  textId: 'LEGITEXT000006070721',
  textCid: null,
  title: 'Code civil',
  articleNumber: String(n),
  status: 'in_force',
  rawStatus: 'VIGUEUR',
  validFrom: '2016-10-01',
  validTo: null,
  snippet: 'x'.repeat(5_000),
  nature: null,
  publishedOn: null,
  nor: null,
});

describe('legifrance_search_legislation (fixtures)', () => {
  it('codes + article number finds art. 1240 with its id', async () => {
    const { result, text } = await call('legifrance_search_legislation', {
      collection: 'codes',
      code: 'Code civil',
      article_number: '1240',
    });
    expect(result.isError).toBeFalsy();
    expect(text).toContain('art. 1240');
    expect(text).toContain('LEGIARTI000032041571');
    expect(text).toContain(
      '(Counts include texts filtered out by the article number; showing matches only.)',
    );
    expect(text).toContain('Searched codes');
  });

  it('no criterion is an error', async () => {
    const { result } = await call('legifrance_search_legislation', { collection: 'codes' });
    expect(result.isError).toBe(true);
  });

  it('page_size 51 is an error', async () => {
    const { result } = await call('legifrance_search_legislation', {
      collection: 'codes',
      code: 'Code civil',
      page_size: 51,
    });
    expect(result.isError).toBe(true);
  });

  it('a page of 50 long hits stays under the text cap, both modes', () => {
    const page: LegislationSearchPage = {
      total: 500,
      page: 1,
      pageSize: 50,
      hits: Array.from({ length: 50 }, (_, i) => ({
        ...hit(i + 1),
        title: `Convention collective nationale ${'très longue '.repeat(10)}${i}`,
      })),
    };
    for (const detailed of [false, true]) {
      const text = renderSearch(page, {
        detailed,
        asked: 'Searched codes',
        filteredByArticleNumber: false,
      });
      expect(text.length).toBeLessThanOrEqual(MAX_TOOL_TEXT);
      expect(text).toContain('Next page: "page": 2');
    }
  });

  it('every hit line carries its official link, concise or detailed', () => {
    for (const detailed of [false, true]) {
      const text = renderSearch(
        { total: 1, page: 1, pageSize: 10, hits: [hit(1)] },
        { detailed, asked: 'a', filteredByArticleNumber: false },
      );
      expect(text).toContain(
        '- Code civil — art. 1 · VIGUEUR · 2016-10-01 → no end · id LEGIARTI000000000001 · https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000000000001',
      );
      expect(text).toContain('Use legifrance_get_article with a hit id');
    }
  });

  it('a JORF text hit renders its status as "as published", not "unknown"', () => {
    const jorfText: LegislationHit = {
      ...hit(1),
      kind: 'text',
      id: 'JORFTEXT000033934937',
      textId: 'JORFTEXT000033934937',
      title: 'Décret n° 2017-23 du 11 janvier 2017',
      status: 'unknown',
      rawStatus: '',
      validFrom: null,
      snippet: null,
    };
    const text = renderSearch(
      { total: 1, page: 1, pageSize: 10, hits: [jorfText] },
      { detailed: false, asked: 'a', filteredByArticleNumber: false },
    );
    const line = text.split('\n').find((l) => l.includes('JORFTEXT000033934937')) ?? '';
    expect(line).toContain('as published');
    expect(line).not.toContain('unknown');
  });

  it('a JORF article hit links to the JO article and is not offered to get_article', () => {
    const jorfArticle: LegislationHit = {
      ...hit(1),
      id: 'JORFARTI000033934948',
      textId: 'JORFTEXT000033934937',
      title: 'Décret n° 2017-23 du 11 janvier 2017',
      status: 'initial',
      rawStatus: 'INITIALE',
      validFrom: null,
      snippet: null,
    };
    const text = renderSearch(
      { total: 1, page: 1, pageSize: 10, hits: [jorfArticle] },
      { detailed: false, asked: 'a', filteredByArticleNumber: false },
    );
    expect(text).toContain('https://www.legifrance.gouv.fr/jorf/article_jo/JORFARTI000033934948');
    expect(text).not.toContain('codes/article_lc/JORFARTI');
    expect(text).not.toContain('legifrance_get_article');
  });

  it('a code article hit from the fixtures carries its link in concise mode', async () => {
    const { result, text } = await call('legifrance_search_legislation', {
      collection: 'codes',
      code: 'Code civil',
      article_number: '1240',
    });
    expect(result.isError).toBeFalsy();
    expect(text).toContain(
      'id LEGIARTI000032041571 · https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032041571',
    );
  });

  it('states the scope each collection really has', () => {
    const at = (args: Parameters<typeof askedLine>[0]) => askedLine(args, TODAY);
    expect(at({ collection: 'codes', query: 'x' })).toBe(
      'Searched codes · query "x" · in force on 2026-11-12',
    );
    expect(at({ collection: 'loda', query: 'x', at_date: '2015-01-01' })).toBe(
      'Searched loda · query "x" · in force on 2015-01-01',
    );
    expect(at({ collection: 'jorf', nor: 'JUSC1522466R' })).toBe(
      'Searched jorf · NOR "JUSC1522466R" · as published',
    );
    expect(at({ collection: 'jorf', nor: 'JUSC1522466R', include_historical: true })).toBe(
      'Searched jorf · NOR "JUSC1522466R" · as published',
    );
    expect(at({ collection: 'kali', idcc: '1486' })).toBe(
      'Searched kali · IDCC "1486" · currently in force (extended or not)',
    );
    expect(at({ collection: 'kali', idcc: '1486', include_historical: true })).toBe(
      'Searched kali · IDCC "1486" · all versions',
    );
    expect(at({ collection: 'codes', query: 'x', include_historical: true })).toBe(
      'Searched codes · query "x" · all versions',
    );
  });

  it('rejects at_date on kali with guidance, as a tool error', async () => {
    const { result, text } = await call('legifrance_search_legislation', {
      collection: 'kali',
      idcc: '1486',
      at_date: '2015-01-01',
    });
    expect(result.isError).toBe(true);
    expect(text).toContain('"at_date" does not apply to the kali collection');
  });

  it('the description matches the criteria rule and the per-collection scope', async () => {
    const fixtures = fixtureFetch();
    unmatchedRoutes.push(fixtures.unmatched);
    const { client, close } = await connectClient(
      compose(sandboxConfig(), { fetch: fixtures.fetch }),
    );
    cleanup.push(close);
    const tool = (await client.listTools()).tools.find(
      (t) => t.name === 'legifrance_search_legislation',
    );
    const description = tool?.description ?? '';
    expect(description).toContain(
      'Give at least one of query, article_number, text_number, nor or idcc',
    );
    expect(description).not.toContain('or a publication date range)');
    expect(description).toContain('"jorf" results are texts as published');
    expect(description).toContain('"kali" results are the agreements currently in force');
  });

  it('concise snippets stop at 200 characters', () => {
    const text = renderSearch(
      { total: 1, page: 1, pageSize: 10, hits: [hit(1)] },
      { detailed: false, asked: 'a', filteredByArticleNumber: false },
    );
    expect(text).not.toContain('x'.repeat(201));
    expect(text).toContain('x'.repeat(190));
  });
});

describe('legifrance_list_changes (fixtures)', () => {
  it('Code civil 2025-2026 lists the amending text and article 61-3-1', async () => {
    const { result, text } = await call('legifrance_list_changes', {
      code: 'Code civil',
      since: '2025-01-01',
      until: '2026-12-31',
    });
    expect(result.isError).toBeFalsy();
    expect(text).toContain('LOI n°2026-667 du 27 juillet 2026 - art. 7');
    expect(text).toContain('61-3-1');
    expect(text).toContain('entry-into-force dates');
  });

  it('text "loi 78-17" lists its changes with entry-into-force dates and the LODA link', async () => {
    const { result, text } = await call(
      'legifrance_list_changes',
      { text: 'loi 78-17', since: '2025-01-01', until: '2026-12-31' },
      { today: () => '2026-11-13' },
    );
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toBeUndefined();
    expect(text).toMatch(/^### .*78-17.* — changes from 2025-01-01 to 2026-12-31$/m);
    expect(text).toContain('Text: https://www.legifrance.gouv.fr/loda/id/LEGITEXT000006068624');
    expect(text).toContain('entry-into-force dates');
    expect(text).toMatch(/^- \d{4}-\d{2}-\d{2} · (created|amended|repealed|codified)/m);
    expect(text).not.toContain('has not loaded the version detail');
    expect(text.length).toBeLessThanOrEqual(MAX_TOOL_TEXT);
  });

  it('code and text together, or neither, is an error', async () => {
    for (const args of [
      { code: 'Code civil', text: 'loi 78-17', since: '2025-01-01' },
      { since: '2025-01-01' },
    ]) {
      const { result, text } = await call('legifrance_list_changes', args);
      expect(result.isError).toBe(true);
      expect(text).toContain('exactly one of');
    }
  });

  it('is titled for codes, laws and decrees alike', async () => {
    const { client } = await connectOnly();
    const tool = (await client.listTools()).tools.find((t) => t.name === 'legifrance_list_changes');
    expect(tool?.title).toBe('List changes to a French code, law or decree');
  });

  it('has no response_format input (it never changed the answer)', async () => {
    const { client } = await connectOnly();
    const tool = (await client.listTools()).tools.find((t) => t.name === 'legifrance_list_changes');
    expect(Object.keys(tool?.inputSchema.properties ?? {})).not.toContain('response_format');
  });

  it('the header link follows the target and the id: code, LEGITEXT text, JORFTEXT text', () => {
    const base = { ...syntheticChanges(2) };
    const at = (target: 'code' | 'text', textId: string) =>
      renderListChanges({ ...base, target, textId }, { today: TODAY, page: 1 });
    expect(at('code', 'LEGITEXT000006070721')).toContain(
      'Code: https://www.legifrance.gouv.fr/codes/texte_lc/LEGITEXT000006070721',
    );
    expect(at('text', 'LEGITEXT000006068624')).toContain(
      'Text: https://www.legifrance.gouv.fr/loda/id/LEGITEXT000006068624',
    );
    expect(at('text', 'JORFTEXT000000886460')).toContain(
      'Text: https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000000886460',
    );
    expect(at('text', 'JORFTEXT000000886460')).toContain('entry-into-force dates');
  });

  it('a bad date is an error', async () => {
    const { result } = await call('legifrance_list_changes', {
      code: 'Code civil',
      since: '2025-13-01',
    });
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

describe('list changes paging', () => {
  it('250 entries: page 1 shows 100 with a Next page hint, text under the cap', () => {
    const view = syntheticChanges(250);
    const p1 = renderListChanges(view, { today: TODAY, page: 1 });
    expect(p1.split('\n').filter((l) => l.startsWith('- ')).length).toBe(100);
    expect(p1).toContain('Next page: "page": 2');
    expect(p1.length).toBeLessThanOrEqual(MAX_TOOL_TEXT);
    expect(p1).toContain('250 entries in');
    expect(p1).toContain('page 1 of 3');
    expect(p1).toContain('### Code du travail — changes from 2026-01-01 to 2027-12-31');

    const p3 = renderListChanges(view, { today: TODAY, page: 3 });
    expect(p3.split('\n').filter((l) => l.startsWith('- ')).length).toBe(50);
    expect(p3).not.toContain('Next page');
    const allText = [1, 2, 3]
      .map((page) => renderListChanges(view, { today: TODAY, page }))
      .join('\n');
    expect(allText.match(/\(scheduled\)/g)?.length).toBe(3);
    expect(p3).toContain('2 versions in this range have an entry-into-force date');
    expect(p3).toContain('has not loaded the version detail for 2027');
    expect(p3).toContain('### Code du travail — changes from');
  });

  it('entry lines show the article id and the header links the code', () => {
    const text = renderListChanges(syntheticChanges(5), { today: TODAY, page: 1 });
    expect(text).toContain('· id LEGIARTI');
    const view = { ...syntheticChanges(5), textId: 'LEGITEXT000006070721' };
    expect(renderListChanges(view, { today: TODAY, page: 1 })).toContain(
      'https://www.legifrance.gouv.fr/codes/texte_lc/LEGITEXT000006070721',
    );
  });

  it('a page past the end is an error from the tool', async () => {
    const view = syntheticChanges(5);
    expect(() => renderListChanges(view, { today: TODAY, page: 2 })).toThrow(/past the last page/);
  });

  it('every page stays under the cap even with huge titles', () => {
    const view = syntheticChanges(300, 300);
    for (const g of view.groups) g.amendingTitle = 'T'.repeat(600);
    for (let page = 1; page <= 3; page++) {
      const r = renderListChanges(view, { today: TODAY, page });
      expect(r.length).toBeLessThanOrEqual(MAX_TOOL_TEXT);
    }
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
