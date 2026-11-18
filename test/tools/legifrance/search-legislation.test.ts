import { describe, expect, it } from 'vitest';
import type {
  LegislationHit,
  LegislationSearchPage,
} from '../../../src/services/legislation/ports.js';
import { toolAnswer } from '../../../src/tools/envelope.js';
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
const LEGIFRANCE = 'Légifrance';
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
