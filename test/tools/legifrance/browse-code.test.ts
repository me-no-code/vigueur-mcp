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
import { renderBrowseCode } from '../../../src/tools/legifrance/browse-code.js';
import {
  createLegifranceSource,
  type LegifranceServices,
} from '../../../src/tools/legifrance/index.js';
import { fixtureFetch, sandboxConfig } from '../../helpers/fixture-fetch.js';
import { connectClient, firstText } from '../../helpers/mcp-client.js';

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
async function composedClient(): Promise<Client> {
  const fixtures = fixtureFetch();
  unmatchedRoutes.push(fixtures.unmatched);
  return connect(compose(sandboxConfig(), { fetch: fixtures.fetch }));
}

async function browse(client: Client, args: Record<string, unknown>) {
  const result = await client.callTool({ name: TOOL, arguments: args });
  return { result, text: firstText(result) };
}

const CODE_URL = 'https://www.legifrance.gouv.fr/codes/texte_lc/LEGITEXT000006072050';

describe('legifrance_browse_code over the composed server (fixtures)', () => {
  it('Code du travail: the top level, then a section_id taken from the answer', async () => {
    const client = await composedClient();
    const root = await browse(client, { code: 'Code du travail' });
    expect(root.result.isError).toBeFalsy();
    expect(root.result.structuredContent).toBeUndefined();
    expect(root.text).toMatch(/^### Code du travail — table of contents on \d{4}-\d{2}-\d{2}$/m);
    expect(root.text).toContain('- Partie législative · section_id LEGISCTA000006112874');
    expect(root.text).toContain(`Source: ${CODE_URL}`);
    expect(root.text).not.toContain('Première partie');

    const sectionId = /section_id (LEGISCTA\d{12})/.exec(root.text)?.[1];
    expect(sectionId).toBe('LEGISCTA000006112874');
    const part = await browse(client, { code: 'Code du travail', section_id: sectionId });
    expect(part.result.isError).toBeFalsy();
    expect(part.text).toContain(
      'Code du travail › Partie législative · section_id LEGISCTA000006112874',
    );
    expect(part.text).toContain(
      '- Première partie : Les relations individuelles de travail · section_id LEGISCTA000006132321',
    );
    expect(part.text).not.toContain('Livre III');
    expect(part.text).toContain(
      'Source: https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000006072050/LEGISCTA000006112874',
    );
  });

  it('a chapter lists its articles with their status and id, below the breadcrumb', async () => {
    const client = await composedClient();
    const { result, text } = await browse(client, {
      code: 'Code du travail',
      section_id: 'LEGISCTA000006177885',
    });
    expect(result.isError).toBeFalsy();
    expect(text).toContain(
      'Code du travail › Partie législative › Première partie : Les relations individuelles de travail › Livre III : Le règlement intérieur et le droit disciplinaire › Titre II : Règlement intérieur › Chapitre Ier : Contenu et conditions de validité. · section_id LEGISCTA000006177885',
    );
    expect(text).toContain('- art. L1321-1 · VIGUEUR · id LEGIARTI000006901432');
    expect(text).toContain('- art. L1321-6 · VIGUEUR · id LEGIARTI000006901439');
    expect(text).toContain('legifrance_get_article');
    expect(text).not.toContain('hidden');
  });

  it('a past date: sections judged by their dates, articles with their label of today', async () => {
    const client = await composedClient();
    const root = await browse(client, { code: 'Code du travail', at_date: '2005-01-01' });
    expect(root.result.isError).toBeFalsy();
    expect(root.text).toContain('Nothing in force here on 2005-01-01.');
    expect(root.text).toContain(
      '(1 item not in force on 2005-01-01 hidden — include_repealed: true to show them)',
    );

    const all = await browse(client, {
      code: 'Code du travail',
      at_date: '2005-01-01',
      include_repealed: true,
    });
    expect(all.text).toContain(
      '- Partie législative · not yet in force — from 2008-05-01 · section_id LEGISCTA000006112874',
    );
    expect(all.text).not.toContain('Nothing in force here');

    const chapter = await browse(client, {
      code: 'Code du travail',
      section_id: 'LEGISCTA000006177885',
      at_date: '2005-01-01',
    });
    expect(chapter.text).toContain(
      "Article labels are Légifrance's current ones; open an article with legifrance_get_article and at_date to check it on 2005-01-01.",
    );
    expect(chapter.text).toContain(
      '- art. L1321-1 (Légifrance label today: VIGUEUR) · id LEGIARTI000006901432',
    );
    expect(chapter.text).not.toContain('hidden');
  });

  it('an unknown section_id is an error', async () => {
    const client = await composedClient();
    const { result, text } = await browse(client, {
      code: 'Code du travail',
      section_id: 'LEGISCTA000000000000',
    });
    expect(result.isError).toBe(true);
    expect(text).toContain('is not a section of Code du travail');
  });

  it('is listed with its description, annotations and no output schema', async () => {
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
    expect(tool?.outputSchema).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------------------------

const TODAY = '2026-11-12';
const CODE_ID = 'LEGITEXT000006070721';

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

  it('service errors are tool errors; the deadline has its own message', async () => {
    const failing = await clientOver(() =>
      Promise.reject(new VigueurError('invalid_input', 'No code is titled "Code civi".')),
    );
    const failed = await browse(failing, { code: 'Code civi' });
    expect(failed.result.isError).toBe(true);
    expect(failed.text).toContain('No code is titled "Code civi".');

    const slow = await clientOver(
      (_input, ctx) =>
        new Promise((_resolve, reject) => {
          ctx?.signal?.addEventListener('abort', () =>
            reject(new VigueurError('cancelled', 'cancelled')),
          );
        }),
      20,
    );
    const late = await browse(slow, { code: 'Code civil' });
    expect(late.result.isError).toBe(true);
    expect(late.text).toContain('did not answer within');
  });

  it('the items it hid are counted as not in force on the date, with how to show them', async () => {
    const client = await clientOver(async () =>
      view({ children: [sec(1, 'Livre Ier')], hiddenNotInForce: 3 }),
    );
    const { result, text } = await browse(client, { code: 'Code civil' });
    expect(result.isError).toBeFalsy();
    expect(text).toContain(
      '(3 items not in force on 2026-11-12 hidden — include_repealed: true to show them)',
    );
  });
});

describe('renderBrowseCode', () => {
  const render = (v: BrowseView, page = 1) => renderBrowseCode(v, { page });

  it('top level: heading with the date, one line per part, the way on, the code link', () => {
    expect(render(view({ children: [sec(1, 'Titre préliminaire'), sec(2, 'Livre Ier')] }))).toBe(
      [
        '### Code civil — table of contents on 2026-11-12',
        '- Titre préliminaire · section_id LEGISCTA000000000001\n- Livre Ier · section_id LEGISCTA000000000002',
        'Pass a section_id to list what it contains; read an article with legifrance_get_article and its id.',
        'Source: https://www.legifrance.gouv.fr/codes/texte_lc/LEGITEXT000006070721',
      ].join('\n\n'),
    );
  });

  it('a section: breadcrumb with its id, articles with status and id, hidden count, section link', () => {
    const text = render(
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
    expect(text).toBe(
      [
        '### Code civil — table of contents on 2026-11-12\nCode civil › Livre III › Chapitre Ier · section_id LEGISCTA000000000003',
        '- art. 1240 · VIGUEUR · id LEGIARTI000000001240\n- art. 1241 · VIGUEUR · id LEGIARTI000000001241',
        '(1 item not in force on 2026-11-12 hidden — include_repealed: true to show them)',
        'Pass a section_id to list what it contains; read an article with legifrance_get_article and its id.',
        'Source: https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000006070721/LEGISCTA000000000003',
      ].join('\n\n'),
    );
  });

  it('with include_repealed today: sections by their dates, articles by their label', () => {
    const text = render(
      view({
        children: [
          sec(1, 'Section 1'),
          sec(2, 'Section 2', { status: 'repealed', validTo: '2020-01-01' }),
          sec(3, 'Section 3', { validFrom: '2030-01-01' }),
          // A label its dates contradict: listed unlabelled, the dates decide.
          sec(4, 'Section 4', { status: 'repealed' }),
        ],
        articles: [art(1), art(2, 'ABROGE')],
      }),
    );
    expect(text).toContain(
      '- Section 2 · no longer in force — ended 2020-01-01 · section_id LEGISCTA000000000002',
    );
    expect(text).toContain(
      '- Section 3 · not yet in force — from 2030-01-01 · section_id LEGISCTA000000000003',
    );
    expect(text).toContain('- Section 1 · section_id LEGISCTA000000000001');
    expect(text).toContain('- Section 4 · section_id LEGISCTA000000000004');
    expect(text).not.toContain('repealed');
    expect(text).toContain('- art. 2 · ABROGE · id LEGIARTI000000000002');
    expect(text).not.toContain('Légifrance label today');
    expect(text).not.toContain('Nothing in force here');
  });

  it('a still-born section shown with include_repealed says it never applied', () => {
    const text = render(view({ children: [sec(1, 'Section 1', { status: 'stillborn' })] }));
    expect(text).toContain(
      '- Section 1 · never in force (still-born) · section_id LEGISCTA000000000001',
    );
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

    it('a part labelled ABROGE today but in force then is listed unlabelled; the hidden one is counted', () => {
      const text = render(past({ children: [ancienne], hiddenNotInForce: 1 }));
      expect(text).toBe(
        [
          '### Code du travail — table of contents on 2005-01-01',
          '- Partie législative ancienne · section_id LEGISCTA000000000001',
          '(1 item not in force on 2005-01-01 hidden — include_repealed: true to show them)',
          'Pass a section_id to list what it contains; read an article with legifrance_get_article and its id.',
          'Source: https://www.legifrance.gouv.fr/codes/texte_lc/LEGITEXT000006070721',
        ].join('\n\n'),
      );
    });

    it('with include_repealed the later part is listed with its start date', () => {
      const text = render(past({ children: [ancienne, nouvelle] }));
      expect(text).toContain('- Partie législative ancienne · section_id LEGISCTA000000000001');
      expect(text).toContain(
        '- Partie législative · not yet in force — from 2008-05-01 · section_id LEGISCTA000000000002',
      );
    });

    it("articles: every one listed with Légifrance's label of today, said once in the header", () => {
      const text = render(
        past({
          breadcrumb: [{ cid: 'LEGISCTA000000000001', title: 'Partie législative ancienne' }],
          node: { cid: 'LEGISCTA000000000001', title: 'Partie législative ancienne' },
          articles: [art(1, 'ABROGE'), art(2)],
        }),
      );
      expect(text).toBe(
        [
          [
            '### Code du travail — table of contents on 2005-01-01',
            'Code du travail › Partie législative ancienne · section_id LEGISCTA000000000001',
            "Article labels are Légifrance's current ones; open an article with legifrance_get_article and at_date to check it on 2005-01-01.",
          ].join('\n'),
          [
            '- art. 1 (Légifrance label today: ABROGE) · id LEGIARTI000000000001',
            '- art. 2 (Légifrance label today: VIGUEUR) · id LEGIARTI000000000002',
          ].join('\n'),
          'Pass a section_id to list what it contains; read an article with legifrance_get_article and its id.',
          'Source: https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000006070721/LEGISCTA000000000001',
        ].join('\n\n'),
      );
      expect(text.match(/Article labels are Légifrance's current ones/g)).toHaveLength(1);
    });

    it('no article: no label note', () => {
      expect(render(past({ children: [ancienne] }))).not.toContain('Article labels');
    });
  });

  it('nothing to list says so', () => {
    expect(render(view())).toContain('Nothing in force here on 2026-11-12.');
  });

  it('one level only, and the shared (cached) subtrees are never modified', () => {
    const children = deepFreeze([
      sec(2, 'Livre II', { children: [node(21, 'Titre caché')], articles: [art(9)] }),
      sec(1, 'Livre I', { children: [node(11, 'Titre caché aussi')] }),
    ]);
    const before = JSON.stringify(children);
    const text = render(view({ children }));
    expect(text).not.toContain('caché');
    expect(text).not.toContain('art. 9');
    expect(text.indexOf('Livre II')).toBeLessThan(text.indexOf('Livre I ·'));
    expect(JSON.stringify(children)).toBe(before);
  });

  it('a long list is paged: bounded pages, frame on each, every item once', () => {
    const children = Array.from({ length: 1500 }, (_, i) =>
      sec(i + 1, `Section ${i + 1} : ${'intitulé très long de la section '.repeat(3)}`),
    );
    const v = view({
      breadcrumb: [{ cid: 'LEGISCTA000000009999', title: 'Livre Ier' }],
      node: { cid: 'LEGISCTA000000009999', title: 'Livre Ier' },
      children,
      articles: [art(1), art(2)],
      hiddenNotInForce: 2,
    });
    const first = render(v);
    const pageCount = Number(/page 1 of (\d+)/.exec(first)?.[1]);
    expect(pageCount).toBeGreaterThan(2);
    const pages = Array.from({ length: pageCount }, (_, i) => render(v, i + 1));
    for (const [i, page] of pages.entries()) {
      expect(page.length).toBeLessThanOrEqual(MAX_TOOL_TEXT);
      expect(page.startsWith('### Code civil — table of contents on 2026-11-12')).toBe(true);
      expect(page).toContain('Code civil › Livre Ier · section_id LEGISCTA000000009999');
      expect(page).toContain(`page ${i + 1} of ${pageCount}`);
      expect(page).toContain('(2 items not in force on 2026-11-12 hidden');
      expect(page.includes(`Next page: "page": ${i + 2}`)).toBe(i + 1 < pageCount);
      expect(page).toContain(
        'Source: https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000006070721/LEGISCTA000000009999',
      );
    }
    const all = pages.join('\n');
    expect(all.match(/^- Section \d+ /gm)).toHaveLength(1500);
    expect(all.match(/^- art\. /gm)).toHaveLength(2);
    expect(() => render(v, pageCount + 1)).toThrow('past the last page');
  });
});
