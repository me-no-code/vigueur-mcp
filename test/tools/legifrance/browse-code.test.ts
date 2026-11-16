import { afterEach, describe, expect, it } from 'vitest';
import { compose } from '../../../src/compose.js';
import { statusAt } from '../../../src/domain/status-at.js';
import type {
  BrowseInput,
  BrowseSection,
  BrowseView,
} from '../../../src/services/legislation/browse.js';
import type { CallContext, TocArticle, TocNode } from '../../../src/services/legislation/ports.js';
import { VigueurError } from '../../../src/shared/errors.js';
import { MAX_TOOL_TEXT } from '../../../src/tools/format.js';
import { buildBrowseCodeAnswer } from '../../../src/tools/legifrance/browse-code.js';
import {
  createLegifranceSource,
  type LegifranceServices,
} from '../../../src/tools/legifrance/index.js';
import { expectAnswer, expectToolError } from '../../helpers/answer.js';
import { fixtureFetch, sandboxConfig } from '../../helpers/fixture-fetch.js';
import { connectClient } from '../../helpers/mcp-client.js';

const TOOL = 'legifrance_browse_code';

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

type Client = Awaited<ReturnType<typeof connectClient>>['client'];

async function connect(deps: Parameters<typeof connectClient>[0]): Promise<Client> {
  const { client, close } = await connectClient(deps);
  cleanup.push(close);
  return client;
}

/** A client over the composed server, answering PISTE from the Légifrance fixtures. */
async function composedClient(opts: { now?: () => Date } = {}): Promise<Client> {
  const fixtures = fixtureFetch();
  unmatchedRoutes.push(fixtures.unmatched);
  return connect(compose(sandboxConfig(), { fetch: fixtures.fetch, ...opts }));
}

async function browse(client: Client, args: Record<string, unknown>) {
  return client.callTool({ name: TOOL, arguments: args });
}

const CODE_URL = 'https://www.legifrance.gouv.fr/codes/texte_lc/LEGITEXT000006072050';
const HINT =
  'Pass a section_id to list what it contains; read an article with legifrance_get_article and its id.';

describe('legifrance_browse_code over the composed server (fixtures)', () => {
  it('Code du travail: the top level, then a section_id taken from the answer', async () => {
    const client = await composedClient();
    const root = expectAnswer(await browse(client, { code: 'Code du travail' }), {
      source: 'Légifrance',
      outcome: 'results',
    });
    expect(root.code).toBe('Code du travail');
    expect(root.code_id).toBe('LEGITEXT000006072050');
    expect(root.on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(root.link).toBe(CODE_URL);
    expect(root.section).toBeNull();
    expect(root.items).toHaveLength(1);
    expect(root.items[0]).toEqual({
      type: 'section',
      title: 'Partie législative',
      section_id: 'LEGISCTA000006112874',
      status: expect.objectContaining({ state: 'in_force', on: root.on }),
    });
    expect(root.section_count).toBe(1);
    expect(root.article_count).toBe(0);
    expect(root.results).toBe(1);
    expect(root.hidden_not_in_force).toBe(0);
    expect(root.page).toEqual({ number: 1, of: 1 });
    expect(root.next).toBeNull();
    expect(root.warnings).toEqual([HINT]);
    expect(JSON.stringify(root)).not.toContain('Première partie');
    expect(root.request).toEqual({
      tool: TOOL,
      code: 'Code du travail',
      at_date: root.on,
      include_repealed: false,
      page: 1,
    });

    const sectionId = root.items[0].section_id;
    const part = expectAnswer(
      await browse(client, { code: 'Code du travail', section_id: sectionId }),
      { source: 'Légifrance', outcome: 'results' },
    );
    expect(part.section).toEqual({
      path: ['Partie législative'],
      section_id: 'LEGISCTA000006112874',
    });
    expect(part.items.map((i: { title: string }) => i.title)).toContain(
      'Première partie : Les relations individuelles de travail',
    );
    expect(part.items).toContainEqual(
      expect.objectContaining({
        type: 'section',
        title: 'Première partie : Les relations individuelles de travail',
        section_id: 'LEGISCTA000006132321',
      }),
    );
    expect(JSON.stringify(part.items)).not.toContain('Livre III');
    expect(part.link).toBe(
      'https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000006072050/LEGISCTA000006112874',
    );
    expect(part.request.section_id).toBe('LEGISCTA000006112874');
  });

  it('a chapter lists its articles with their status and id, below the breadcrumb', async () => {
    const client = await composedClient();
    const a = expectAnswer(
      await browse(client, { code: 'Code du travail', section_id: 'LEGISCTA000006177885' }),
      { source: 'Légifrance', outcome: 'results' },
    );
    expect(a.section.section_id).toBe('LEGISCTA000006177885');
    expect(a.section.path).toEqual([
      'Partie législative',
      'Première partie : Les relations individuelles de travail',
      'Livre III : Le règlement intérieur et le droit disciplinaire',
      'Titre II : Règlement intérieur',
      'Chapitre Ier : Contenu et conditions de validité.',
    ]);
    expect(a.items).toContainEqual({
      type: 'article',
      number: 'L1321-1',
      id: 'LEGIARTI000006901432',
      legifrance_status_today: 'VIGUEUR',
    });
    expect(a.items).toContainEqual({
      type: 'article',
      number: 'L1321-6',
      id: 'LEGIARTI000006901439',
      legifrance_status_today: 'VIGUEUR',
    });
    expect(a.article_count).toBeGreaterThan(0);
    expect(a.hidden_not_in_force).toBe(0);
    expect(a.warnings).toEqual([HINT]);
  });

  it('a past date: sections judged by their dates, articles with their label of today', async () => {
    const client = await composedClient();
    const root = expectAnswer(
      await browse(client, { code: 'Code du travail', at_date: '2005-01-01' }),
      { source: 'Légifrance', outcome: 'no_results' },
    );
    expect(root.on).toBe('2005-01-01');
    expect(root.items).toEqual([]);
    expect(root.results).toBe(0);
    expect(root.hidden_not_in_force).toBe(1);
    expect(root.warnings).toEqual([
      '(1 item not in force on 2005-01-01 hidden — include_repealed: true to show them)',
      'Nothing in force here on 2005-01-01.',
      HINT,
    ]);

    const all = expectAnswer(
      await browse(client, {
        code: 'Code du travail',
        at_date: '2005-01-01',
        include_repealed: true,
      }),
      { source: 'Légifrance', outcome: 'results' },
    );
    expect(all.items).toContainEqual({
      type: 'section',
      title: 'Partie législative',
      section_id: 'LEGISCTA000006112874',
      status: {
        state: 'not_yet_in_force',
        on: '2005-01-01',
        from: '2008-05-01',
        until: null,
        until_undetermined: false,
      },
    });
    expect(all.warnings).toEqual([HINT]);

    const chapter = expectAnswer(
      await browse(client, {
        code: 'Code du travail',
        section_id: 'LEGISCTA000006177885',
        at_date: '2005-01-01',
      }),
      { source: 'Légifrance', outcome: 'results' },
    );
    expect(chapter.warnings).toContain(
      "Article labels are Légifrance's current ones; open an article with legifrance_get_article and at_date to check it on 2005-01-01.",
    );
    expect(chapter.items).toContainEqual({
      type: 'article',
      number: 'L1321-1',
      id: 'LEGIARTI000006901432',
      legifrance_status_today: 'VIGUEUR',
    });
    expect(chapter.hidden_not_in_force).toBe(0);
  });

  it('a page past the last is no_results with the same fields, not an error', async () => {
    const client = await composedClient();
    const a = expectAnswer(await browse(client, { code: 'Code du travail', page: 99 }), {
      source: 'Légifrance',
      outcome: 'no_results',
    });
    expect(a.items).toEqual([]);
    expect(a.results).toBe(1);
    expect(a.page).toEqual({ number: 99, of: 1 });
    expect(a.next).toBeNull();
    expect(a.request.page).toBe(99);
  });

  it('an unknown section_id is an error', async () => {
    const client = await composedClient();
    const e = expectToolError(
      await browse(client, { code: 'Code du travail', section_id: 'LEGISCTA000000000000' }),
      'invalid_input',
    );
    expect(e.error.message).toContain('is not a section of Code du travail');
    expect(e.request.tool).toBe(TOOL);
  });

  it('lists the table of contents with the time it was fetched; a second call keeps that time', async () => {
    // The clock advances one minute per reading.
    let t = Date.UTC(2026, 10, 16, 8, 0, 0);
    const client = await composedClient({
      now: () => {
        t += 60_000;
        return new Date(t);
      },
    });
    const first = expectAnswer(await browse(client, { code: 'Code du travail' }), {
      source: 'Légifrance',
      outcome: 'results',
    });
    const second = expectAnswer(await browse(client, { code: 'Code du travail' }), {
      source: 'Légifrance',
      outcome: 'results',
    });
    expect(first.cached).toHaveLength(1);
    expect(first.cached[0].what).toBe(`Code du travail table of contents on ${first.on}`);
    expect(first.cached[0].retrieved).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
    expect(second.cached[0].retrieved).toBe(first.cached[0].retrieved);
    expect(second.cached[0].retrieved < second.retrieved).toBe(true);
  });

  it('is listed with its description, annotations and an output schema', async () => {
    const client = await composedClient();
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === TOOL);
    expect(tool?.description).toBe(
      "Browse the table of contents of a French code on Légifrance (books, titles, chapters, sections, articles) as it stood on a date (default today). Start without section_id to see the top level, then pass a section_id from the answer to go deeper. Sections not in force on the date, judged by their own dates, are hidden unless include_repealed is true. Articles carry only Légifrance's current label: today, repealed articles are hidden unless include_repealed is true; on another date every article is listed with today's label, so check one on that date with legifrance_get_article and at_date. Use legifrance_get_article to read an article listed here.",
    );
    expect(tool?.annotations).toEqual({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    });
    expect(tool?.outputSchema).toBeDefined();
  });
});

// ---------------------------------------------------------------------------------------------

const TODAY = '2026-11-12';
const CODE_ID = 'LEGITEXT000006070721';
const FETCHED_AT = new Date('2026-11-10T08:00:00Z');

const art = (n: number, rawStatus = 'VIGUEUR'): TocArticle => ({
  id: `LEGIARTI${String(n).padStart(12, '0')}`,
  cid: `LEGIARTI${String(n).padStart(12, '0')}`,
  num: String(n),
  status: rawStatus === 'VIGUEUR' ? 'in_force' : 'repealed',
  rawStatus,
});

const node = (n: number, title: string, rest: Partial<TocNode> = {}): TocNode => ({
  cid: `LEGISCTA${String(n).padStart(12, '0')}`,
  title,
  status: 'in_force',
  validFrom: '2000-01-01',
  validTo: null,
  children: [],
  articles: [],
  ...rest,
});

/** A child section as the service hands it: judged by its dates on `asOf`. */
const sec = (
  n: number,
  title: string,
  rest: Partial<TocNode> = {},
  asOf = TODAY,
): BrowseSection => {
  const section = node(n, title, rest);
  return { section, force: statusAt(section, asOf) };
};

function view(over: Partial<BrowseView> = {}): BrowseView {
  return {
    codeId: CODE_ID,
    codeTitle: 'Code civil',
    asOf: TODAY,
    asOfIsToday: true,
    breadcrumb: [],
    node: null,
    children: [],
    articles: [],
    hiddenNotInForce: 0,
    fetchedAt: FETCHED_AT,
    ...over,
  };
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

function fakeServices(browseCode: LegifranceServices['browseCode']): LegifranceServices {
  const unused = () => Promise.reject(new Error('not used in these tests'));
  return {
    getArticle: unused,
    getArticleHistory: unused,
    searchLegislation: unused,
    listChanges: unused,
    getText: unused,
    browseCode,
    latestJo: unused,
    listReferenceValues: unused,
    searchCaseLaw: unused,
    getDecision: unused,
  };
}

async function clientOver(browseCode: LegifranceServices['browseCode'], deadlineMs?: number) {
  return connect({
    config: sandboxConfig(),
    getStatus: () => Promise.reject(new Error('not used')),
    sources: [
      createLegifranceSource(fakeServices(browseCode), {
        today: () => TODAY,
        ...(deadlineMs !== undefined && { deadlineMs }),
      }),
    ],
  });
}

describe('legifrance_browse_code handler', () => {
  it('passes the inputs (blank → absent) and the abort signal to the service', async () => {
    const seen: Array<{ input: BrowseInput; ctx: CallContext | undefined }> = [];
    const client = await clientOver(async (input, ctx) => {
      seen.push({ input, ctx });
      return view();
    });
    await browse(client, { code: ' Code civil ', section_id: '', at_date: '' });
    await browse(client, {
      code: 'Code civil',
      section_id: 'LEGISCTA000000000001',
      at_date: '2015-01-01',
      include_repealed: true,
    });
    expect(seen[0]?.input).toEqual({ code: 'Code civil' });
    expect(seen[1]?.input).toEqual({
      code: 'Code civil',
      sectionCid: 'LEGISCTA000000000001',
      atDate: '2015-01-01',
      includeRepealed: true,
    });
    expect(seen[0]?.ctx?.signal).toBeInstanceOf(AbortSignal);
  });

  it('a blank at_date or section_id echoes as absent, the defaults applied', async () => {
    const client = await clientOver(async () => view());
    const a = expectAnswer(
      await browse(client, { code: ' Code civil ', section_id: '', at_date: '' }),
      { source: 'Légifrance', outcome: 'no_results' },
    );
    expect(a.request).toEqual({
      tool: TOOL,
      code: 'Code civil',
      at_date: TODAY,
      include_repealed: false,
      page: 1,
    });
  });

  it('service errors are tool errors carrying the request; the deadline has its own kind', async () => {
    const failing = await clientOver(() =>
      Promise.reject(new VigueurError('invalid_input', 'No code is titled "Code civi".')),
    );
    const failed = expectToolError(await browse(failing, { code: 'Code civi' }), 'invalid_input');
    expect(failed.error.message).toContain('No code is titled "Code civi".');
    expect(failed.request).toEqual({
      tool: TOOL,
      code: 'Code civi',
      at_date: TODAY,
      include_repealed: false,
      page: 1,
    });

    const slow = await clientOver(
      (_input, ctx) =>
        new Promise((_resolve, reject) => {
          ctx?.signal?.addEventListener('abort', () =>
            reject(new VigueurError('cancelled', 'cancelled')),
          );
        }),
      20,
    );
    expectToolError(await browse(slow, { code: 'Code civil' }), 'deadline');
  });

  it('the items it hid are counted as not in force on the date, with how to show them', async () => {
    const client = await clientOver(async () =>
      view({ children: [sec(1, 'Livre Ier')], hiddenNotInForce: 3 }),
    );
    const a = expectAnswer(await browse(client, { code: 'Code civil' }), {
      source: 'Légifrance',
      outcome: 'results',
    });
    expect(a.hidden_not_in_force).toBe(3);
    expect(a.warnings).toEqual([
      '(3 items not in force on 2026-11-12 hidden — include_repealed: true to show them)',
      HINT,
    ]);
  });
});

describe('buildBrowseCodeAnswer', () => {
  const request = { tool: TOOL, code: 'Code civil' };
  const build = (v: BrowseView, page = 1) => buildBrowseCodeAnswer(v, { request, page });
  const sectionStatus = (state: string, from: string | null, until: string | null) => ({
    state,
    on: TODAY,
    from,
    until,
    until_undetermined: false,
  });

  it('top level: one section item per part, the code link, no section, the way on', () => {
    const a = build(view({ children: [sec(1, 'Titre préliminaire'), sec(2, 'Livre Ier')] }));
    expect(a.outcome).toBe('results');
    expect(a.code).toBe('Code civil');
    expect(a.code_id).toBe(CODE_ID);
    expect(a.on).toBe(TODAY);
    expect(a.link).toBe('https://www.legifrance.gouv.fr/codes/texte_lc/LEGITEXT000006070721');
    expect(a.section).toBeNull();
    expect(a.items.map((i) => (i.type === 'section' ? i.title : null))).toEqual([
      'Titre préliminaire',
      'Livre Ier',
    ]);
    expect(a.items[0]).toEqual({
      type: 'section',
      title: 'Titre préliminaire',
      section_id: 'LEGISCTA000000000001',
      status: sectionStatus('in_force', '2000-01-01', null),
    });
    expect(a.section_count).toBe(2);
    expect(a.article_count).toBe(0);
    expect(a.results).toBe(2);
    expect(a.warnings).toEqual([HINT]);
    expect(a.cached).toEqual([
      { what: `Code civil table of contents on ${TODAY}`, retrieved: '2026-11-10T08:00:00Z' },
    ]);
    expect(a.request).toBe(request);
  });

  it('a section: path with its id, articles with number, id and label, hidden count, section link', () => {
    const a = build(
      view({
        breadcrumb: [
          { cid: 'LEGISCTA000000000002', title: 'Livre III' },
          { cid: 'LEGISCTA000000000003', title: 'Chapitre Ier' },
        ],
        node: { cid: 'LEGISCTA000000000003', title: 'Chapitre Ier' },
        articles: [art(1240), art(1241)],
        hiddenNotInForce: 1,
      }),
    );
    expect(a.section).toEqual({
      path: ['Livre III', 'Chapitre Ier'],
      section_id: 'LEGISCTA000000000003',
    });
    expect(a.items).toEqual([
      {
        type: 'article',
        number: '1240',
        id: 'LEGIARTI000000001240',
        legifrance_status_today: 'VIGUEUR',
      },
      {
        type: 'article',
        number: '1241',
        id: 'LEGIARTI000000001241',
        legifrance_status_today: 'VIGUEUR',
      },
    ]);
    expect(a.hidden_not_in_force).toBe(1);
    expect(a.warnings).toEqual([
      '(1 item not in force on 2026-11-12 hidden — include_repealed: true to show them)',
      HINT,
    ]);
    expect(a.link).toBe(
      'https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000006070721/LEGISCTA000000000003',
    );
  });

  it('an article without a number has a null number', () => {
    const a = build(view({ articles: [{ ...art(1), num: null }] }));
    expect(a.items[0]).toMatchObject({ type: 'article', number: null });
  });

  it('with include_repealed today: sections by their dates, articles by their label', () => {
    const a = build(
      view({
        children: [
          sec(1, 'Section 1'),
          sec(2, 'Section 2', { status: 'repealed', validTo: '2020-01-01' }),
          sec(3, 'Section 3', { validFrom: '2030-01-01' }),
          // A label its dates contradict: the dates decide.
          sec(4, 'Section 4', { status: 'repealed' }),
        ],
        articles: [art(1), art(2, 'ABROGE')],
      }),
    );
    const status = (id: string) =>
      (a.items.find((i) => i.type === 'section' && i.section_id === id) as { status: unknown })
        .status;
    expect(status('LEGISCTA000000000001')).toEqual(sectionStatus('in_force', '2000-01-01', null));
    expect(status('LEGISCTA000000000002')).toEqual(
      sectionStatus('not_in_force', '2000-01-01', '2020-01-01'),
    );
    expect(status('LEGISCTA000000000003')).toEqual(
      sectionStatus('not_yet_in_force', '2030-01-01', null),
    );
    expect(status('LEGISCTA000000000004')).toEqual(sectionStatus('in_force', '2000-01-01', null));
    expect(a.items.at(-1)).toMatchObject({ type: 'article', legifrance_status_today: 'ABROGE' });
    expect(a.warnings).toEqual([HINT]);
  });

  it('a still-born section shown with include_repealed never applied', () => {
    const a = build(view({ children: [sec(1, 'Section 1', { status: 'stillborn' })] }));
    expect(a.items[0]).toMatchObject({ status: { state: 'never_applied' } });
  });

  describe('on a past date (Code du travail, recodified on 2008-05-01)', () => {
    const PAST = '2005-01-01';
    const ancienne = sec(
      1,
      'Partie législative ancienne',
      { status: 'repealed', validFrom: '1973-11-02', validTo: '2008-05-01' },
      PAST,
    );
    const nouvelle = sec(2, 'Partie législative', { validFrom: '2008-05-01' }, PAST);
    const past = (over: Partial<BrowseView>) =>
      view({ codeTitle: 'Code du travail', asOf: PAST, asOfIsToday: false, ...over });

    it('a part labelled ABROGE today but in force then is in force on the date; the hidden one is counted', () => {
      const a = build(past({ children: [ancienne], hiddenNotInForce: 1 }));
      expect(a.items).toEqual([
        {
          type: 'section',
          title: 'Partie législative ancienne',
          section_id: 'LEGISCTA000000000001',
          status: {
            state: 'in_force',
            on: PAST,
            from: '1973-11-02',
            until: '2008-05-01',
            until_undetermined: false,
          },
        },
      ]);
      expect(a.warnings).toEqual([
        '(1 item not in force on 2005-01-01 hidden — include_repealed: true to show them)',
        HINT,
      ]);
    });

    it('with include_repealed the later part has its start date', () => {
      const a = build(past({ children: [ancienne, nouvelle] }));
      expect(a.items[1]).toMatchObject({
        title: 'Partie législative',
        status: { state: 'not_yet_in_force', from: '2008-05-01' },
      });
    });

    it("articles: every one with Légifrance's label of today, the caveat said once", () => {
      const a = build(
        past({
          breadcrumb: [{ cid: 'LEGISCTA000000000001', title: 'Partie législative ancienne' }],
          node: { cid: 'LEGISCTA000000000001', title: 'Partie législative ancienne' },
          articles: [art(1, 'ABROGE'), art(2)],
        }),
      );
      expect(a.items.map((i) => (i.type === 'article' ? i.legifrance_status_today : null))).toEqual(
        ['ABROGE', 'VIGUEUR'],
      );
      expect(a.warnings).toEqual([
        "Article labels are Légifrance's current ones; open an article with legifrance_get_article and at_date to check it on 2005-01-01.",
        HINT,
      ]);
    });

    it('no article: no label caveat', () => {
      expect(build(past({ children: [ancienne] })).warnings).toEqual([HINT]);
    });
  });

  it('nothing to list is no_results and says so', () => {
    const a = build(view());
    expect(a.outcome).toBe('no_results');
    expect(a.items).toEqual([]);
    expect(a.results).toBe(0);
    expect(a.warnings).toEqual(['Nothing in force here on 2026-11-12.', HINT]);
  });

  it('one level only, and the shared (cached) subtrees are never modified', () => {
    const children = deepFreeze([
      sec(2, 'Livre II', { children: [node(21, 'Titre caché')], articles: [art(9)] }),
      sec(1, 'Livre I', { children: [node(11, 'Titre caché aussi')] }),
    ]);
    const before = JSON.stringify(children);
    const a = build(view({ children }));
    expect(JSON.stringify(a)).not.toContain('caché');
    expect(a.items.map((i) => (i.type === 'section' ? i.title : null))).toEqual([
      'Livre II',
      'Livre I',
    ]);
    expect(JSON.stringify(children)).toBe(before);
  });

  describe('a long list is paged', () => {
    const children = Array.from({ length: 4000 }, (_, i) =>
      sec(i + 1, `Section ${i + 1} : ${'intitulé très long de la section '.repeat(3)}`),
    );
    const v = view({
      breadcrumb: [{ cid: 'LEGISCTA000000009999', title: 'Livre Ier' }],
      node: { cid: 'LEGISCTA000000009999', title: 'Livre Ier' },
      children,
      articles: [art(1), art(2)],
      hiddenNotInForce: 2,
    });
    // One build per requested page, as the tool does: the split must not depend on the page asked.
    const pageCount = build(v).page.of;
    const pages = Array.from({ length: pageCount }, (_, i) =>
      buildBrowseCodeAnswer(v, { request: { ...request, page: i + 1 }, page: i + 1 }),
    );

    it('needs many pages, each bounded, with the frame on each', () => {
      expect(pageCount).toBeGreaterThanOrEqual(10);
      for (const [i, a] of pages.entries()) {
        expect(JSON.stringify(a).length).toBeLessThanOrEqual(MAX_TOOL_TEXT);
        expect(a.page).toEqual({ number: i + 1, of: pageCount });
        expect(a.next).toEqual(i + 1 < pageCount ? { page: i + 2 } : null);
        expect(a.section?.section_id).toBe('LEGISCTA000000009999');
        expect(a.results).toBe(4002);
        expect(a.section_count).toBe(4000);
        expect(a.article_count).toBe(2);
        expect(a.hidden_not_in_force).toBe(2);
      }
    });

    it('reading pages 1..N gives every section and article exactly once, in order', () => {
      const keys = pages.flatMap((a) =>
        a.items.map((i) => (i.type === 'section' ? i.section_id : i.id)),
      );
      const expected = [
        ...children.map((c) => c.section.cid),
        'LEGIARTI000000000001',
        'LEGIARTI000000000002',
      ];
      expect(keys).toEqual(expected);
    });

    it('past the last page is no_results with the same fields', () => {
      const a = build(v, pageCount + 1);
      expect(a.outcome).toBe('no_results');
      expect(a.items).toEqual([]);
      expect(a.results).toBe(4002);
      expect(a.page).toEqual({ number: pageCount + 1, of: pageCount });
      expect(a.next).toBeNull();
    });
  });
});
