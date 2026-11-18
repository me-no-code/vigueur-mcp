import { describe, expect, it } from 'vitest';
import type { ChangesView } from '../../../src/services/legislation/changes.js';
import type { ArticleHistoryView } from '../../../src/services/legislation/history.js';
import type {
  ChangeEntry,
  HistoryEntry,
  LegislationHit,
  LegislationSearchPage,
} from '../../../src/services/legislation/ports.js';
import { toolAnswer } from '../../../src/tools/envelope.js';
import {
  buildGetArticleHistoryAnswer,
  getArticleHistoryOutput,
} from '../../../src/tools/legifrance/get-article-history.js';
import {
  buildListChangesAnswer,
  listChangesOutput,
} from '../../../src/tools/legifrance/list-changes.js';
import {
  buildSearchLegislationAnswer,
  searchLegislationOutput,
  searchScope,
} from '../../../src/tools/legifrance/search-legislation.js';
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

const SEARCH = 'legifrance_search_legislation';
const CHANGES = 'legifrance_list_changes';

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

const SEARCH_REQUEST = {
  tool: SEARCH,
  collection: 'codes',
  query: 'x',
  at_date: TODAY,
  include_historical: false,
  page: 1,
  page_size: 10,
  response_format: 'concise',
};

/** One page of a search answer, through the schema and the envelope. */
function searchPage(
  result: LegislationSearchPage,
  opts: { detailed?: boolean; filtered?: boolean; outcome?: string } = {},
) {
  const body = buildSearchLegislationAnswer(result, {
    request: { ...SEARCH_REQUEST, page: result.page, page_size: result.pageSize },
    scope: 'in_force_on',
    collection: 'codes',
    detailed: opts.detailed ?? false,
    filteredByArticleNumber: opts.filtered ?? false,
  });
  return expectAnswer(toolAnswer(searchLegislationOutput, body, { now: () => new Date() }), {
    source: LEGIFRANCE,
    outcome: opts.outcome ?? 'results',
  });
}

const onePage = (hits: LegislationHit[], total = hits.length): LegislationSearchPage => ({
  total,
  page: 1,
  pageSize: 10,
  hits,
});

describe('legifrance_search_legislation (fixtures)', () => {
  it('codes + article number finds art. 1240 with its id', async () => {
    const { result } = await call(SEARCH, {
      collection: 'codes',
      code: 'Code civil',
      article_number: '1240',
    });
    const a = expectAnswer(result, { source: LEGIFRANCE, outcome: 'results' });
    expect(a.collection).toBe('codes');
    expect(a.scope).toBe('in_force_on');
    expect(a.warnings).toContain(
      '(Counts include texts filtered out by the article number; showing matches only.)',
    );
    expect(a.results).toBeGreaterThan(0);
    expect(a.page).toEqual({ number: 1, of: Math.max(1, Math.ceil(a.results / 10)) });
    const item = a.items.find((i: { id: string }) => i.id === 'LEGIARTI000032041571');
    expect(item).toMatchObject({
      kind: 'article',
      number: '1240',
      legifrance_status: 'VIGUEUR',
      link: 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032041571',
      read_with: { tool: 'legifrance_get_article', id: 'LEGIARTI000032041571' },
    });
    expect(item.title).toContain('Code civil');
    expect(item.text_id).toMatch(/^LEGITEXT/);
    expect(item.from).toBe('2016-10-01');
    expect(item.until).toBeNull();
    expect(a.request).toMatchObject({
      tool: SEARCH,
      collection: 'codes',
      code: 'Code civil',
      article_number: '1240',
      page: 1,
      page_size: 10,
      include_historical: false,
      response_format: 'concise',
    });
    expect(a.request.at_date).toMatch(/^\d{4}-\d\d-\d\d$/);
  });

  it('a LODA text hit carries its nature and is read with get_text', async () => {
    const { result } = await call(SEARCH, { collection: 'loda', text_number: '78-17' });
    const a = expectAnswer(result, { source: LEGIFRANCE, outcome: 'results' });
    const item = a.items.find((i: { kind: string; nature: string | null }) => i.kind === 'text');
    expect(item).toBeDefined();
    expect(item.nature).toBe('LOI');
    expect(item.id).toMatch(/^LEGITEXT/);
    // The search ran at today's date (echoed in the request): the pointer keeps it.
    expect(item.read_with).toEqual({
      tool: 'legifrance_get_text',
      id: item.text_id,
      at_date: a.request.at_date,
    });
    expect(item.link).toMatch(/^https:\/\/www\.legifrance\.gouv\.fr\/loda\/id\/LEGITEXT/);
    expect(a.warnings).toEqual([]);
  });

  it('a JORF hit carries nature, NOR and publication date', async () => {
    const { result } = await call(SEARCH, { collection: 'jorf', query: '*' });
    const a = expectAnswer(result, { source: LEGIFRANCE, outcome: 'results' });
    const item = a.items[0];
    expect(item.nature).toEqual(expect.any(String));
    expect(item.nor).toMatch(/^[A-Z]{4}\d{7}[A-Z]$/);
    expect(item.published).toMatch(/^\d{4}-\d\d-\d\d$/);
    expect(item.link).toMatch(/^https:\/\/www\.legifrance\.gouv\.fr\/jorf\//);
  });

  it('no criterion is an error', async () => {
    const { result } = await call(SEARCH, { collection: 'codes' });
    expectToolError(result, 'invalid_input');
  });

  it('page_size 51 is an error', async () => {
    const { result } = await call(SEARCH, {
      collection: 'codes',
      code: 'Code civil',
      page_size: 51,
    });
    expect(result.isError).toBe(true);
  });

  it('rejects at_date on kali with guidance, as a tool error', async () => {
    const { result } = await call(SEARCH, {
      collection: 'kali',
      idcc: '1486',
      at_date: '2015-01-01',
    });
    const e = expectToolError(result, 'invalid_input');
    expect(e.error.message).toContain('"at_date" does not apply to the kali collection');
    expect(e.request).toEqual({
      tool: SEARCH,
      collection: 'kali',
      idcc: '1486',
      at_date: '2015-01-01',
      include_historical: false,
      page: 1,
      page_size: 10,
      response_format: 'concise',
    });
  });

  it('declares an output schema', async () => {
    const client = await composed();
    const tools = (await client.listTools()).tools;
    for (const name of [SEARCH, CHANGES]) {
      expect(tools.find((t) => t.name === name)?.outputSchema?.type).toBe('object');
    }
  });

  it('the description matches the criteria rule and the per-collection scope', async () => {
    const client = await composed();
    const tool = (await client.listTools()).tools.find((t) => t.name === SEARCH);
    const description = tool?.description ?? '';
    expect(description).toContain(
      'Give at least one of query, article_number, text_number, nor or idcc',
    );
    expect(description).toContain('"jorf" results are texts as published');
    expect(description).toContain('"kali" results are the agreements currently in force');
  });
});

describe('search answers (constructed pages)', () => {
  it('a page past the last one is no_results with the same fields and an empty list', () => {
    const past = searchPage(
      { total: 25, page: 99, pageSize: 10, hits: [] },
      { outcome: 'no_results' },
    );
    expect(past.items).toEqual([]);
    expect(past.results).toBe(25);
    expect(past.page).toEqual({ number: 99, of: 3 });
    expect(past.next).toBeNull();
    expect(Object.keys(past)).toEqual(Object.keys(searchPage(onePage([hit(1)]))));
  });

  it('no hit at all: no_results on one page', () => {
    const a = searchPage(onePage([]), { outcome: 'no_results' });
    expect(a.results).toBe(0);
    expect(a.page).toEqual({ number: 1, of: 1 });
  });

  it('pages: of = ceil(total / page_size), next while hits remain', () => {
    const p2 = searchPage({ total: 25, page: 2, pageSize: 10, hits: [hit(1)] });
    expect(p2.page).toEqual({ number: 2, of: 3 });
    expect(p2.next).toEqual({ page: 3 });
    const p3 = searchPage({ total: 25, page: 3, pageSize: 10, hits: [hit(1)] });
    expect(p3.next).toBeNull();
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
    // expectAnswer bounds each answer by MAX_TOOL_TEXT.
    const concise = searchPage(page);
    expect(concise.items).toHaveLength(50);
    expect(concise.next).toEqual({ page: 2 });
    const detailed = searchPage(page, { detailed: true });
    expect(detailed.items.length).toBeLessThan(50);
    expect(detailed.warnings).toEqual([
      `(Only the first ${detailed.items.length} of 50 hits of this page fit — use a smaller "page_size".)`,
    ]);
    expect(detailed.next).toEqual({ page: 2 });
  });

  it('every hit carries its official link, concise or detailed', () => {
    for (const detailed of [false, true]) {
      const a = searchPage(onePage([hit(1)]), { detailed });
      expect(a.items[0]).toMatchObject({
        title: 'Code civil',
        number: '1',
        id: 'LEGIARTI000000000001',
        text_id: 'LEGITEXT000006070721',
        legifrance_status: 'VIGUEUR',
        from: '2016-10-01',
        until: null,
        link: 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000000000001',
        read_with: { tool: 'legifrance_get_article', id: 'LEGIARTI000000000001' },
      });
    }
  });

  it('a JORF text hit has no Légifrance status, as published, and is read with get_text', () => {
    const jorfText: LegislationHit = {
      ...hit(1),
      kind: 'text',
      id: 'JORFTEXT000033934937',
      textId: 'JORFTEXT000033934937',
      title: 'Décret n° 2017-23 du 11 janvier 2017',
      articleNumber: null,
      status: 'unknown',
      rawStatus: '',
      validFrom: null,
      snippet: null,
      nature: 'DECRET',
      publishedOn: '2017-01-12',
      nor: 'JUSC1700001D',
    };
    const [item] = searchPage(onePage([jorfText])).items;
    expect(item).toMatchObject({
      kind: 'text',
      number: null,
      nature: 'DECRET',
      nor: 'JUSC1700001D',
      published: '2017-01-12',
      legifrance_status: null,
      from: null,
      excerpt: null,
      link: 'https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000033934937',
      read_with: { tool: 'legifrance_get_text', id: 'JORFTEXT000033934937' },
    });
  });

  it('a JORF article hit links to the JO article and has no read_with', () => {
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
    const [item] = searchPage(onePage([jorfArticle])).items;
    expect(item.link).toBe('https://www.legifrance.gouv.fr/jorf/article_jo/JORFARTI000033934948');
    expect(item.read_with).toBeNull();
    expect(item.legifrance_status).toBe('INITIALE');
  });

  it('a dated search reads a LEGITEXT text at that date; a JORFTEXT text carries none', () => {
    const text = (id: string): LegislationHit => ({
      ...hit(1),
      kind: 'text',
      id,
      textId: id,
      articleNumber: null,
    });
    const dated = (hits: LegislationHit[]) =>
      expectAnswer(
        toolAnswer(
          searchLegislationOutput,
          buildSearchLegislationAnswer(onePage(hits), {
            request: { ...SEARCH_REQUEST, at_date: '2024-05-01' },
            scope: 'in_force_on',
            collection: 'loda',
            detailed: false,
            filteredByArticleNumber: false,
          }),
          { now: () => new Date() },
        ),
        { source: LEGIFRANCE, outcome: 'results' },
      );
    const items = dated([text('LEGITEXT000006068624'), text('JORFTEXT000033934937')]).items;
    expect(items[0].read_with).toEqual({
      tool: 'legifrance_get_text',
      id: 'LEGITEXT000006068624',
      at_date: '2024-05-01',
    });
    expect(items[1].read_with).toEqual({ tool: 'legifrance_get_text', id: 'JORFTEXT000033934937' });
  });

  it('an every-version search reads a LEGITEXT text at the start of the version listed, whatever at_date', () => {
    const text = (id: string, validFrom: string | null): LegislationHit => ({
      ...hit(1),
      kind: 'text',
      id,
      textId: id,
      articleNumber: null,
      validFrom,
    });
    const hits = [
      text('LEGITEXT000006068624', '2019-06-01'),
      text('LEGITEXT000006068625', null),
      text('JORFTEXT000033934937', '2017-01-01'),
    ];
    const { at_date: _omitted, ...undated } = SEARCH_REQUEST;
    const requests = [
      { ...undated, include_historical: true },
      { ...SEARCH_REQUEST, at_date: '2024-05-01', include_historical: true },
    ];
    for (const request of requests) {
      const { items } = expectAnswer(
        toolAnswer(
          searchLegislationOutput,
          buildSearchLegislationAnswer(onePage(hits), {
            request,
            scope: 'all_versions',
            collection: 'loda',
            detailed: false,
            filteredByArticleNumber: false,
          }),
          { now: () => new Date() },
        ),
        { source: LEGIFRANCE, outcome: 'results' },
      );
      expect(items.map((i: { read_with: unknown }) => i.read_with)).toEqual([
        { tool: 'legifrance_get_text', id: 'LEGITEXT000006068624', at_date: '2019-06-01' },
        { tool: 'legifrance_get_text', id: 'LEGITEXT000006068625' },
        { tool: 'legifrance_get_text', id: 'JORFTEXT000033934937' },
      ]);
    }
  });

  it('a collective agreement article is read with get_article', () => {
    const kali: LegislationHit = { ...hit(1), id: 'KALIARTI000005635601' };
    expect(searchPage(onePage([kali])).items[0].read_with).toEqual({
      tool: 'legifrance_get_article',
      id: 'KALIARTI000005635601',
    });
  });

  it('concise excerpts stop at 200 characters, detailed ones are whole', () => {
    const concise = searchPage(onePage([hit(1)])).items[0].excerpt;
    expect(concise.length).toBeLessThanOrEqual(200);
    expect(concise.endsWith('…')).toBe(true);
    expect(concise).toContain('x'.repeat(190));
    expect(searchPage(onePage([hit(1)]), { detailed: true }).items[0].excerpt).toBe(
      'x'.repeat(5_000),
    );
  });

  it('states the scope each collection really has', () => {
    expect(searchScope('codes', false)).toBe('in_force_on');
    expect(searchScope('loda', false)).toBe('in_force_on');
    expect(searchScope('jorf', false)).toBe('as_published');
    expect(searchScope('jorf', true)).toBe('as_published');
    expect(searchScope('kali', false)).toBe('in_force_on');
    expect(searchScope('kali', true)).toBe('all_versions');
    expect(searchScope('codes', true)).toBe('all_versions');
  });
});

describe('search requests', () => {
  const answer = async (args: Record<string, unknown>) => {
    const { result } = await call(SEARCH, args, { today: () => TODAY });
    return result;
  };

  it('jorf and kali have no default at_date; codes and loda default to today', async () => {
    const jorf = expectAnswer(await answer({ collection: 'jorf', query: '*' }), {
      source: LEGIFRANCE,
      outcome: 'results',
    });
    expect(jorf.scope).toBe('as_published');
    expect(jorf.request).not.toHaveProperty('at_date');
    expect(jorf.request).toMatchObject({ page: 1, page_size: 10, include_historical: false });
  });
});

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
