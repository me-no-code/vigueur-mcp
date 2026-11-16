import { afterEach, describe, expect, it, vi } from 'vitest';
import { htmlToText } from '../../../src/clients/html.js';
import { compose } from '../../../src/compose.js';
import { loadConfig } from '../../../src/config.js';
import type { ServerDeps } from '../../../src/server.js';
import type {
  ArticleView,
  GetArticleInput,
  GetArticleResult,
} from '../../../src/services/legislation/get-article.js';
import type { CallContext, VersionSummary } from '../../../src/services/legislation/ports.js';
import { VigueurError } from '../../../src/shared/errors.js';
import { toolAnswer } from '../../../src/tools/envelope.js';
import { MAX_TOOL_TEXT } from '../../../src/tools/format.js';
import {
  buildGetArticleAnswer,
  getArticleOutput,
} from '../../../src/tools/legifrance/get-article.js';
import {
  createLegifranceSource,
  type LegifranceServices,
} from '../../../src/tools/legifrance/index.js';
import { expectAnswer, expectToolError } from '../../helpers/answer.js';
import { loadFixture } from '../../helpers/fake-piste-http.js';
import {
  bodyField,
  type FixtureRoute,
  fixtureFetch,
  LEGIFRANCE_FIXTURE_ROUTES,
  sandboxConfig,
} from '../../helpers/fixture-fetch.js';
import { connectClient, firstText } from '../../helpers/mcp-client.js';

const TOOL = 'legifrance_get_article';
const SOURCE = 'Légifrance';
const FOUND = { source: SOURCE, outcome: 'found' };

type Answer = ReturnType<typeof expectAnswer>;

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

async function connect(deps: ServerDeps) {
  const { client, close } = await connectClient(deps);
  cleanup.push(close);
  return client;
}

/** A client over the composed server, answering PISTE from the Légifrance fixtures (or `routes`). */
async function composedClient(routes?: readonly FixtureRoute[]) {
  const fixtures = fixtureFetch(routes);
  unmatchedRoutes.push(fixtures.unmatched);
  return connect(compose(sandboxConfig(), { fetch: fixtures.fetch }));
}

async function call(args: Record<string, unknown>) {
  const client = await composedClient();
  return client.callTool({ name: TOOL, arguments: args });
}

const link = (id: string) => `https://www.legifrance.gouv.fr/codes/article_lc/${id}`;

describe('legifrance_get_article over the composed server (fixtures)', () => {
  it('Code civil 1240 today: official text, in force, link', async () => {
    const a = expectAnswer(await call({ code: 'Code civil', number: '1240' }), FOUND);
    expect(a.code).toBe('Code civil');
    expect(a.number).toBe('1240');
    expect(a.text).toContain('Tout fait quelconque');
    expect(a.status).toEqual({
      state: 'in_force',
      on: a.request.at_date,
      from: '2016-10-01',
      until: null,
      until_undetermined: false,
    });
    expect(a.legifrance_status).toBe('VIGUEUR');
    expect(a.section.join(' › ')).toContain(
      'Livre III : Des différentes manières dont on acquiert la propriété › Titre III : Des sources d',
    );
    expect(a.link).toBe(link('LEGIARTI000032041571'));
    expect(a.id).toBe('LEGIARTI000032041571');
    expect(a.versions).toBeNull();
    expect(a.request).toEqual({
      tool: TOOL,
      code: 'Code civil',
      number: '1240',
      at_date: expect.stringMatching(/^\d{4}-\d\d-\d\d$/),
      response_format: 'concise',
      offset: 0,
      include_neighbours: false,
    });
  });

  it('a blank code is absent from the request (Code civil 1240, code "")', async () => {
    const a = expectAnswer(await call({ code: '', number: '1240' }), FOUND);
    expect(a.id).toBe('LEGIARTI000032041571');
    expect('code' in a.request).toBe(false);
    expect(Object.keys(a.request)).toEqual([
      'tool',
      'number',
      'at_date',
      'response_format',
      'offset',
      'include_neighbours',
    ]);
  });

  it('L1234-1 without a code lists both codes instead of picking one', async () => {
    const a = expectAnswer(await call({ number: 'L1234-1' }), {
      source: SOURCE,
      outcome: 'several_matches',
    });
    expect(a.warnings).toContain(
      'Article L1234-1 exists in several codes — call again with "code".',
    );
    expect(a.number).toBe('L1234-1');
    expect(a.code).toBeNull();
    expect(a.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'Code du travail', from: '2008-05-01' }),
        expect.objectContaining({ code: 'Code de la santé publique', from: '2004-08-07' }),
      ]),
    );
    for (const c of a.candidates) {
      expect(c.read_with).toEqual({ tool: TOOL, id: c.id });
    }
  });

  it('Code civil 1382 on 2015-01-01: old text, and where its content moved', async () => {
    const a = expectAnswer(
      await call({ code: 'Code civil', number: '1382', at_date: '2015-01-01' }),
      FOUND,
    );
    expect(a.text).toContain('Tout fait quelconque');
    expect(a.status).toEqual({
      state: 'in_force',
      on: '2015-01-01',
      from: '1804-03-21',
      until: '2016-10-01',
      until_undetermined: false,
    });
    expect(a.legifrance_status).toBe('MODIFIE');
    expect(a.relocation).toContain(
      'Content moved — per Légifrance concordance, the text of art. 1382 as of 2015-01-01 is now at Code civil - art. 1240 (V)',
    );
  });

  it('a repealed article is reported with its periods, not as not found', async () => {
    const a = expectAnswer(await call({ code: 'Code du travail', number: 'R4217-2' }), {
      source: SOURCE,
      outcome: 'not_in_force',
    });
    expect(a.warnings[0]).toMatch(
      /^Art\. R4217-2 of Code du travail exists but was not in force on \d{4}-\d\d-\d\d\.$/,
    );
    expect(a.number).toBe('R4217-2');
    expect(a.code).toBe('Code du travail');
    expect(a.periods).toContainEqual({
      id: 'LEGIARTI000018532352',
      code: 'Code du travail',
      legifrance_status: 'ABROGE',
      from: '2008-05-01',
      until: '2026-10-01',
      until_undetermined: false,
      link: link('LEGIARTI000018532352'),
    });
  });

  it('detailed adds the versions, modifications and citation count', async () => {
    const a = expectAnswer(
      await call({
        code: 'Code civil',
        number: '1382',
        at_date: '2015-01-01',
        response_format: 'detailed',
      }),
      FOUND,
    );
    expect(a.versions).toContainEqual(
      expect.objectContaining({
        version: '1.0',
        shown: true,
        legifrance_status: 'MODIFIE',
        from: '1804-03-21',
        until: '2016-10-01',
      }),
    );
    expect(a.versions).toContainEqual(
      expect.objectContaining({
        version: '2.0',
        shown: false,
        legifrance_status: 'VIGUEUR',
        from: '2016-10-01',
        until: null,
        until_undetermined: false,
      }),
    );
    expect(a.modifications).toContainEqual(
      expect.objectContaining({
        action: 'created',
        by: expect.stringContaining('Loi 1804-02-09 promulguée le 19 février 1804'),
      }),
    );
    expect(a.cited_by).toBe(65);
  });

  it('1240: detailed gives versions, modifications and cited_by; concise gives null for all three', async () => {
    const detailed = expectAnswer(
      await call({ code: 'Code civil', number: '1240', response_format: 'detailed' }),
      FOUND,
    );
    expect(Array.isArray(detailed.versions)).toBe(true);
    expect(detailed.versions.length).toBeGreaterThan(0);
    expect(detailed.versions.filter((v: Answer) => v.shown)).toEqual([
      expect.objectContaining({ id: 'LEGIARTI000032041571' }),
    ]);
    expect(Array.isArray(detailed.modifications)).toBe(true);
    expect(typeof detailed.cited_by).toBe('number');

    const concise = expectAnswer(await call({ code: 'Code civil', number: '1240' }), FOUND);
    expect(concise.versions).toBeNull();
    expect(concise.modifications).toBeNull();
    expect(concise.cited_by).toBeNull();
  });

  it('blank optional inputs count as absent', async () => {
    const a = expectAnswer(await call({ number: 'L1234-1', code: '', at_date: '', id: '' }), {
      source: SOURCE,
      outcome: 'several_matches',
    });
    expect(a.candidates.map((c: Answer) => c.code)).toContain('Code de la santé publique');
    expect(Object.keys(a.request)).toEqual([
      'tool',
      'number',
      'at_date',
      'response_format',
      'offset',
      'include_neighbours',
    ]);
  });

  it('an unknown code is reported as such, without searching any article', async () => {
    const a = expectAnswer(await call({ code: 'C. route', number: 'R413-17' }), {
      source: SOURCE,
      outcome: 'not_found',
    });
    expect(a.reason).toBe('unknown_code');
    expect(a.code).toBe('C. route');
    expect(a.number).toBe('R413-17');
    expect(a.warnings[0]).toContain('Unknown code "C. route": no Légifrance code has this title.');
  });

  it('rejects an impossible date', async () => {
    const result = await call({ at_date: '2015-13-01', number: '1240' });
    expect(result.isError).toBe(true);
    expect(firstText(result)).toContain('YYYY-MM-DD');
  });

  it('rejects a call without number or id', async () => {
    const e = expectToolError(await call({}), 'invalid_input');
    expect(e.error.message).toContain('Give an article number with its code');
    expect(e.request).toEqual({
      tool: TOOL,
      at_date: expect.stringMatching(/^\d{4}-\d\d-\d\d$/),
      response_format: 'concise',
      offset: 0,
      include_neighbours: false,
    });
  });

  it('include_neighbours on Code civil 1240: first of its chapter, then art. 1241 (fixtures 23, 113)', async () => {
    const a = expectAnswer(
      await call({ code: 'Code civil', number: '1240', include_neighbours: true }),
      FOUND,
    );
    expect(a.neighbours).toEqual({
      previous: null,
      // Art. 1241 is 128 characters long: shown whole.
      next: {
        number: '1241',
        id: 'LEGIARTI000032041565',
        excerpt:
          "Chacun est responsable du dommage qu'il a causé non seulement par son fait, mais encore par sa négligence ou par son imprudence.",
        excerpt_cut: false,
        link: link('LEGIARTI000032041565'),
      },
    });
    expect(a.warnings).toEqual([]);
    expect(a.request.include_neighbours).toBe(true);
  });

  it('without include_neighbours, no neighbours are read or shown', async () => {
    const fixtures = fixtureFetch();
    unmatchedRoutes.push(fixtures.unmatched);
    const client = await connect(compose(sandboxConfig(), { fetch: fixtures.fetch }));
    const result = await client.callTool({
      name: TOOL,
      arguments: { code: 'Code civil', number: '1240' },
    });
    expect(expectAnswer(result, FOUND).neighbours).toBeNull();
    expect(fixtures.calls.some((c) => c.url.endsWith('/consult/getSectionByCid'))).toBe(false);
  });

  it('is listed with annotations and an output schema, only when configured', async () => {
    const client = await composedClient();
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === TOOL);
    expect(tool?.annotations).toEqual({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    });
    expect(tool?.outputSchema?.type).toBe('object');
    expect(tool?.description).toContain('it lists the candidates instead of guessing');

    const unconfigured = await connect(compose(loadConfig({})));
    const names = (await unconfigured.listTools()).tools.map((t) => t.name);
    expect(names).not.toContain(TOOL);
  });
});

// ---------------------------------------------------------------------------------------------
// The tool over fake services: signal, request echo, errors.

const TODAY = '2026-11-12';
const NOW = new Date('2026-11-12T09:30:15.250Z');

function fakeServices(getArticle: LegifranceServices['getArticle']): LegifranceServices {
  const unused = () => Promise.reject(new Error('not used in these tests'));
  return {
    getArticle,
    getArticleHistory: unused,
    searchLegislation: unused,
    listChanges: unused,
    getText: unused,
    browseCode: unused,
    latestJo: unused,
    listReferenceValues: unused,
    searchCaseLaw: unused,
    getDecision: unused,
  };
}

async function clientOver(getArticle: LegifranceServices['getArticle']) {
  return connect({
    config: sandboxConfig(),
    getStatus: () => Promise.reject(new Error('not used')),
    sources: [
      createLegifranceSource(fakeServices(getArticle), { today: () => TODAY, now: () => NOW }),
    ],
  });
}

function view(over: Partial<ArticleView> = {}, text = 'Texte officiel.'): ArticleView {
  return {
    record: {
      version: {
        id: 'LEGIARTI000000000001',
        number: '7',
        text,
        status: 'in_force',
        rawStatus: 'VIGUEUR',
        validFrom: '2010-01-01',
        validTo: null,
      },
      cid: 'LEGIARTI000000000001',
      textId: 'LEGITEXT000006070721',
      textTitle: 'Code civil',
      nota: null,
      sectionPath: [],
      sectionCid: null,
      versions: [],
      modifications: [],
      citationsCount: 0,
    },
    asOf: TODAY,
    statusAt: { inForce: true, reason: 'in_force', from: '2010-01-01', until: null },
    warnings: [],
    url: link('LEGIARTI000000000001'),
    relocation: null,
    ...over,
  };
}

const found = (over?: Partial<ArticleView>, text?: string): GetArticleResult => ({
  kind: 'found',
  article: view(over, text),
});

/** The request echo of `{ number: '7' }` with every default applied. */
const REQUEST = {
  tool: TOOL,
  number: '7',
  at_date: TODAY,
  response_format: 'concise',
  offset: 0,
  include_neighbours: false,
};

describe('legifrance_get_article handler', () => {
  it('passes the request abort signal and the inputs (blank → absent) to the service', async () => {
    const seen: Array<{ input: GetArticleInput; ctx: CallContext | undefined }> = [];
    const client = await clientOver(async (input, ctx) => {
      seen.push({ input, ctx });
      return found();
    });
    await client.callTool({
      name: TOOL,
      arguments: { code: ' Code civil ', number: '7', id: '', at_date: '2020-01-01' },
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.input).toEqual({ code: 'Code civil', number: '7', atDate: '2020-01-01' });
    expect(seen[0]?.input.includeNeighbours).not.toBe(true);
    expect(seen[0]?.ctx?.signal).toBeInstanceOf(AbortSignal);
  });

  it('include_neighbours asks the service for the neighbours', async () => {
    const seen: GetArticleInput[] = [];
    const client = await clientOver(async (input) => {
      seen.push(input);
      return found();
    });
    await client.callTool({ name: TOOL, arguments: { number: '7', include_neighbours: true } });
    expect(seen[0]).toEqual({ number: '7', includeNeighbours: true });
  });

  it('cancelling the call aborts the signal the service received', async () => {
    let received: (signal: AbortSignal | undefined) => void = () => {};
    const signalSeen = new Promise<AbortSignal | undefined>((resolve) => {
      received = resolve;
    });
    const client = await clientOver(
      (_input, ctx) =>
        new Promise((_resolve, reject) => {
          received(ctx?.signal);
          ctx?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    const controller = new AbortController();
    const pending = client
      .callTool({ name: TOOL, arguments: { number: '7' } }, { signal: controller.signal })
      .catch(() => undefined);
    const signal = await signalSeen;
    expect(signal?.aborted).toBe(false);
    controller.abort();
    await pending;
    await vi.waitFor(() => expect(signal?.aborted).toBe(true));
  });

  it('found: the answer carries the article text, the request with its defaults, and the time', async () => {
    const client = await clientOver(async () => found());
    const result = await client.callTool({ name: TOOL, arguments: { number: '7' } });
    const a = expectAnswer(result, FOUND);
    expect(a.text).toBe('Texte officiel.');
    expect(a.request).toEqual(REQUEST);
    expect(a.retrieved).toBe('2026-11-12T09:30:15Z');
    expect(a.cached).toEqual([]);
  });

  it('rejects an offset past the end of the article text', async () => {
    const client = await clientOver(async () => found());
    const result = await client.callTool({ name: TOOL, arguments: { number: '7', offset: 15 } });
    const e = expectToolError(result, 'invalid_input');
    expect(e.error.message).toContain('past the end');
    expect(e.request).toEqual({ ...REQUEST, offset: 15 });
  });

  it('returns service failures as tool errors', async () => {
    const client = await clientOver(() => Promise.reject(new Error('boom')));
    const result = await client.callTool({ name: TOOL, arguments: { number: '7' } });
    const e = expectToolError(result, 'unexpected');
    expect(e.error.message).toContain('boom');
    expect(e.request).toEqual(REQUEST);
  });
});

// ---------------------------------------------------------------------------------------------
// Long articles: only the article text is paginated; every page carries every field.

type Client = Awaited<ReturnType<typeof clientOver>>;

/** Every page of an article, following `next.offset` from the first page. */
async function readAllPages(client: Client, args: Record<string, unknown>): Promise<Answer[]> {
  const pages: Answer[] = [];
  let offset = 0;
  for (let i = 0; i < 50; i++) {
    const result = await client.callTool({
      name: TOOL,
      arguments: offset > 0 ? { ...args, offset } : args,
    });
    const a = expectAnswer(result, FOUND);
    pages.push(a);
    if (a.next === null) return pages;
    offset = a.next.offset;
  }
  throw new Error('more than 50 pages');
}

/**
 * The pages chain: each `part` starts where the previous page's `next.offset` pointed and ends
 * where its own does, and the texts joined are `full`.
 */
function expectChain(pages: Answer[], full: string) {
  let from = 0;
  for (const page of pages) {
    const to = page.next === null ? full.length : page.next.offset;
    expect(page.part).toEqual({ from, to, of: full.length });
    expect(page.text).toHaveLength(to - from);
    from = to;
  }
  expect(pages.map((p) => p.text).join('')).toBe(full);
}

describe('legifrance_get_article on a long article', () => {
  const longText = Array.from(
    { length: 3400 },
    (_, i) => `Alinéa ${i} : texte "officiel" de l'article, cité tel quel.`,
  ).join('\n');
  const base = view({}, longText);
  const longArticle: GetArticleResult = {
    kind: 'found',
    article: {
      ...base,
      record: { ...base.record, nota: 'Une note.', sectionPath: ['Livre Ier', 'Titre II'] },
      warnings: ['Légifrance marks this version in force, but also records its abrogation.'],
    },
  };

  it('is synthetic and long', () => {
    expect(longText.length).toBeGreaterThan(180_000);
  });

  it.each(['concise', 'detailed'])(
    '%s: every page carries every field, stays bounded, and the pages rebuild the text',
    async (format) => {
      const client = await clientOver(async () => longArticle);
      const pages = await readAllPages(client, { number: '7', response_format: format });
      expect(pages.length).toBeGreaterThanOrEqual(5);
      for (const page of pages) {
        // expectAnswer already bounded the page by MAX_TOOL_TEXT.
        expect(JSON.stringify(page).length).toBeLessThanOrEqual(MAX_TOOL_TEXT);
        expect(page.status).toEqual({
          state: 'in_force',
          on: TODAY,
          from: '2010-01-01',
          until: null,
          until_undetermined: false,
        });
        expect(page.legifrance_status).toBe('VIGUEUR');
        expect(page.section).toEqual(['Livre Ier', 'Titre II']);
        expect(page.note).toBe('Une note.');
        expect(page.warnings).toEqual([
          'Légifrance marks this version in force, but also records its abrogation.',
        ]);
        expect(page.link).toBe(link('LEGIARTI000000000001'));
        expect(page.id).toBe('LEGIARTI000000000001');
        expect(page.cited_by === null).toBe(format === 'concise');
        expect(page.versions === null).toBe(format === 'concise');
      }
      expect(pages.at(-1)?.next).toBeNull();
      expectChain(pages, longText);
    },
  );

  it('offsets index the article text, whatever the response format', async () => {
    const client = await clientOver(async () => longArticle);
    const result = await client.callTool({
      name: TOOL,
      arguments: { number: '7', offset: 100_000, response_format: 'detailed' },
    });
    const a = expectAnswer(result, FOUND);
    expect(a.part.from).toBe(100_000);
    expect(a.text.startsWith(longText.slice(100_000, 100_200))).toBe(true);
    expect(a.request.offset).toBe(100_000);
  });

  const CGI = 'LEGIARTI000046892900';

  it('CGI art. 199 undecies B by id (fixture 59): bounded pages, each with the article fields', async () => {
    const client = await composedClient();
    const texts: string[] = [];
    for (const format of ['concise', 'detailed']) {
      const pages = await readAllPages(client, { id: CGI, response_format: format });
      for (const page of pages) {
        expect(page.code).toBe('Code général des impôts');
        expect(page.number).toBe('199 undecies B');
        expect(page.status.state).toBe('in_force');
        expect(page.id).toBe(CGI);
      }
      texts.push(pages.map((p) => p.text).join(''));
    }
    // Both formats page the same text.
    expect(texts[0]?.length).toBeGreaterThan(30_000);
    expect(texts[1]).toBe(texts[0]);
  });

  it('CGI art. 199 undecies B, its text repeated past 60 000 characters: offsets chain over pages', async () => {
    // Test-only route: fixture 59 with its HTML text twice over, so the text needs several pages
    // (fixture 59 alone fits one concise page). The rest of the record is the fixture's.
    const recorded = loadFixture('59-getArticleWithIdAndNum-cgi-long') as {
      article: { texteHtml: string };
    };
    const html = recorded.article.texteHtml.repeat(2);
    const longCgi: FixtureRoute = {
      path: '/consult/getArticle',
      when: bodyField('id', CGI),
      body: () => ({ ...recorded, article: { ...recorded.article, texteHtml: html } }),
    };
    const full = htmlToText(html);
    expect(full.length).toBeGreaterThan(60_000);
    expect(full).toMatch(/["\n]/);

    const client = await composedClient([longCgi, ...LEGIFRANCE_FIXTURE_ROUTES]);
    for (const format of ['concise', 'detailed']) {
      const pages = await readAllPages(client, { id: CGI, response_format: format });
      expect(pages.length).toBeGreaterThanOrEqual(2);
      for (const page of pages) {
        expect(page.id).toBe(CGI);
        expect(page.status.state).toBe('in_force');
      }
      expectChain(pages, full);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// The answer builder, through the schema and the envelope.

const answer = (
  r: GetArticleResult,
  outcome: string,
  opts: { detailed?: boolean; requestedId?: string } = {},
) =>
  expectAnswer(
    toolAnswer(
      getArticleOutput,
      buildGetArticleAnswer(r, {
        detailed: false,
        today: TODAY,
        requestedId: null,
        offset: 0,
        request: REQUEST,
        ...opts,
      }),
      { now: () => NOW },
    ),
    { source: SOURCE, outcome },
  );

const summary = (over: Partial<VersionSummary> = {}): VersionSummary => ({
  id: 'LEGIARTI000000000002',
  version: '2.0',
  status: 'in_force' as const,
  rawStatus: 'VIGUEUR',
  validFrom: '2020-01-01',
  validTo: null,
  validToUndetermined: false,
  ...over,
});

describe('buildGetArticleAnswer', () => {
  it('found: every field, in order', () => {
    const a = answer(
      found({
        record: {
          ...view().record,
          nota: 'Conformément à l’article 9, ces dispositions entrent en vigueur le 1er janvier 2010.',
          sectionPath: ['Livre Ier', 'Titre II'],
          sectionCid: 'LEGISCTA000000000001',
        },
        warnings: ['Légifrance marks this version in force, but also records its abrogation.'],
      }),
      'found',
    );
    expect(Object.keys(a)).toEqual([
      'source',
      'outcome',
      'warnings',
      'id',
      'link',
      'status',
      'legifrance_status',
      'code',
      'code_id',
      'number',
      'section',
      'section_id',
      'note',
      'relocation',
      'neighbours',
      'versions',
      'modifications',
      'cited_by',
      'part',
      'next',
      'text',
      'request',
      'retrieved',
      'cached',
      'vigueur_version',
    ]);
    expect(a).toMatchObject({
      warnings: ['Légifrance marks this version in force, but also records its abrogation.'],
      id: 'LEGIARTI000000000001',
      link: link('LEGIARTI000000000001'),
      status: {
        state: 'in_force',
        on: '2026-11-12',
        from: '2010-01-01',
        until: null,
        until_undetermined: false,
      },
      legifrance_status: 'VIGUEUR',
      code: 'Code civil',
      code_id: 'LEGITEXT000006070721',
      number: '7',
      section: ['Livre Ier', 'Titre II'],
      section_id: 'LEGISCTA000000000001',
      note: 'Conformément à l’article 9, ces dispositions entrent en vigueur le 1er janvier 2010.',
      relocation: null,
      neighbours: null,
      versions: null,
      modifications: null,
      cited_by: null,
      part: null,
      next: null,
      text: 'Texte officiel.',
      request: REQUEST,
      retrieved: '2026-11-12T09:30:15Z',
      cached: [],
    });
  });

  it('found with no text: an empty text, and no label when Légifrance gives none', () => {
    const base = view({}, '');
    const a = answer(
      found({ record: { ...base.record, version: { ...base.record.version, rawStatus: '' } } }, ''),
      'found',
    );
    expect(a.text).toBe('');
    expect(a.part).toBeNull();
    expect(a.next).toBeNull();
    expect(a.legifrance_status).toBeNull();
  });

  it('detailed: versions (the shown one marked), modifications and citation count', () => {
    const base = view();
    const a = answer(
      found({
        record: {
          ...base.record,
          versions: [
            summary({
              id: 'LEGIARTI000000000001',
              version: '1.0',
              rawStatus: 'VIGUEUR',
              validFrom: '2010-01-01',
            }),
            summary({ status: 'deferred', rawStatus: 'VIGUEUR_DIFF', validFrom: '2027-01-01' }),
          ],
          modifications: [
            { kind: 'creation', textTitle: 'Loi n° 1', effectiveDate: '2010-01-01' },
            { kind: 'modification', textTitle: 'Loi n° 2', effectiveDate: null },
            { kind: 'abrogation', textTitle: 'Loi n° 3', effectiveDate: '2030-01-01' },
            { kind: 'codification', textTitle: 'Ordonnance n° 4', effectiveDate: null },
            { kind: 'other', textTitle: 'Décret n° 5', effectiveDate: null },
          ],
          citationsCount: 1,
        },
      }),
      'found',
      { detailed: true },
    );
    expect(a.versions).toEqual([
      {
        id: 'LEGIARTI000000000001',
        version: '1.0',
        legifrance_status: 'VIGUEUR',
        from: '2010-01-01',
        until: null,
        until_undetermined: false,
        shown: true,
      },
      {
        id: 'LEGIARTI000000000002',
        version: '2.0',
        legifrance_status: 'VIGUEUR_DIFF',
        from: '2027-01-01',
        until: null,
        until_undetermined: false,
        shown: false,
      },
    ]);
    expect(a.modifications).toEqual([
      { action: 'created', by: 'Loi n° 1', effective: '2010-01-01' },
      { action: 'amended', by: 'Loi n° 2', effective: null },
      { action: 'repealed', by: 'Loi n° 3', effective: '2030-01-01' },
      { action: 'codified', by: 'Ordonnance n° 4', effective: null },
      { action: 'linked', by: 'Décret n° 5', effective: null },
    ]);
    expect(a.cited_by).toBe(1);
  });

  it('neighbours: number, id, the excerpt as given, whether it is cut, and the link', () => {
    const neighbour = (n: string, excerpt: string, truncated = true) => ({
      id: `LEGIARTI00000000000${n}`,
      num: n,
      excerpt,
      truncated,
      url: link(`LEGIARTI00000000000${n}`),
    });
    const whole = answer(
      found({ neighbours: { previous: null, next: neighbour('8', 'Article court.', false) } }),
      'found',
    );
    expect(whole.neighbours).toEqual({
      previous: null,
      next: {
        number: '8',
        id: 'LEGIARTI000000000008',
        excerpt: 'Article court.',
        excerpt_cut: false,
        link: link('LEGIARTI000000000008'),
      },
    });
    const a = answer(
      found({
        neighbours: { previous: neighbour('6', 'Premier alinéa.\n\nSecond   alinéa'), next: null },
        warnings: ['Could not read the neighbouring article LEGIARTI000000000008 (boom).'],
      }),
      'found',
    );
    expect(a.neighbours).toEqual({
      previous: {
        number: '6',
        id: 'LEGIARTI000000000006',
        excerpt: 'Premier alinéa.\n\nSecond   alinéa',
        excerpt_cut: true,
        link: link('LEGIARTI000000000006'),
      },
      next: null,
    });
    expect(a.warnings).toEqual([
      'Could not read the neighbouring article LEGIARTI000000000008 (boom).',
    ]);
    expect(answer(found(), 'found').neighbours).toBeNull();
  });

  it('relocation without concordance: inferred from text comparison, past tense', () => {
    const a = answer(
      found({
        asOf: '2015-01-01',
        relocation: {
          change: 'amended',
          movedTo: [],
          evidence: [],
          from: summary({ id: 'LEGIARTI000000000001' }),
          successor: summary({ validFrom: '2020-01-01' }),
        },
      }),
      'found',
    );
    expect(a.relocation).toBe(
      'The content of this article was amended on 2020-01-01 (inferred from text comparison).',
    );
  });

  it('relocation after today: future tense', () => {
    const a = answer(
      found({
        relocation: {
          change: 'replaced',
          movedTo: [],
          evidence: ['text_similarity'],
          from: summary({ id: 'LEGIARTI000000000001' }),
          successor: summary({ validFrom: '2027-01-01' }),
        },
      }),
      'found',
    );
    expect(a.relocation).toBe(
      'The content of this article will be replaced on 2027-01-01 (inferred from text comparison).',
    );
  });

  it('relocation per concordance after today: future tense', () => {
    const a = answer(
      found({
        relocation: {
          change: 'replaced',
          movedTo: [
            {
              id: 'LEGIARTI000000000009',
              num: '8',
              codeTitle: 'Code civil',
              label: 'Code civil - art. 8',
            },
          ],
          evidence: ['concordance'],
          from: summary({ id: 'LEGIARTI000000000001' }),
          successor: summary({ validFrom: '2027-01-01' }),
        },
      }),
      'found',
    );
    expect(a.relocation).toBe(
      'Content will move — per Légifrance concordance, the text of art. 7 as of 2026-11-12 will be at Code civil - art. 8 from 2027-01-01.',
    );
  });

  it('ambiguous with possibly more candidates says so', () => {
    const hit = {
      num: '1',
      status: 'in_force' as const,
      rawStatus: 'VIGUEUR',
      validFrom: '2000-01-01',
      validTo: null,
      validToUndetermined: false,
    };
    const a = answer(
      {
        kind: 'ambiguous',
        num: '1',
        candidates: [
          {
            ...hit,
            id: 'LEGIARTI000000000001',
            codeId: 'LEGITEXT000000000001',
            codeTitle: 'Code A',
          },
          {
            ...hit,
            id: 'LEGIARTI000000000002',
            codeId: 'LEGITEXT000000000002',
            codeTitle: 'Code B',
          },
        ],
        possiblyIncomplete: true,
      },
      'several_matches',
    );
    expect(a).toMatchObject({
      warnings: [
        'Article 1 exists in several codes — call again with "code".',
        '(Only the first matches are listed — give the code to narrow it down.)',
      ],
      number: '1',
      code: null,
      candidates: [
        {
          id: 'LEGIARTI000000000001',
          code: 'Code A',
          code_id: 'LEGITEXT000000000001',
          from: '2000-01-01',
          legifrance_status: 'VIGUEUR',
          read_with: { tool: TOOL, id: 'LEGIARTI000000000001' },
        },
        {
          id: 'LEGIARTI000000000002',
          code: 'Code B',
          code_id: 'LEGITEXT000000000002',
          from: '2000-01-01',
          legifrance_status: 'VIGUEUR',
          read_with: { tool: TOOL, id: 'LEGIARTI000000000002' },
        },
      ],
      incomplete: true,
    });
  });

  it('ambiguous within one code asks for the id', () => {
    const hit = {
      num: '1',
      codeId: 'LEGITEXT000000000001',
      codeTitle: 'Code A',
      status: 'in_force' as const,
      rawStatus: 'VIGUEUR',
      validTo: null,
      validToUndetermined: false,
    };
    const a = answer(
      {
        kind: 'ambiguous',
        num: '1',
        candidates: [
          { ...hit, id: 'LEGIARTI000000000001', validFrom: '2000-01-01' },
          { ...hit, id: 'LEGIARTI000000000002', validFrom: '2001-01-01' },
        ],
      },
      'several_matches',
    );
    expect(a.warnings).toEqual([
      'Article 1 has several versions in force in Code A — call again with "id".',
    ]);
    expect(a.code).toBe('Code A');
    expect(a.incomplete).toBe(false);
    expect(a.candidates[1]).toMatchObject({
      id: 'LEGIARTI000000000002',
      from: '2001-01-01',
      legifrance_status: 'VIGUEUR',
    });
  });

  it('ambiguous across codes with a repeated code adds the ids', () => {
    const hit = {
      num: '1',
      status: 'in_force' as const,
      rawStatus: 'VIGUEUR',
      validFrom: '2000-01-01',
      validTo: null,
      validToUndetermined: false,
    };
    const a = answer(
      {
        kind: 'ambiguous',
        num: '1',
        candidates: [
          {
            ...hit,
            id: 'LEGIARTI000000000001',
            codeId: 'LEGITEXT000000000001',
            codeTitle: 'Code A',
          },
          {
            ...hit,
            id: 'LEGIARTI000000000002',
            codeId: 'LEGITEXT000000000001',
            codeTitle: 'Code A',
          },
          {
            ...hit,
            id: 'LEGIARTI000000000003',
            codeId: 'LEGITEXT000000000002',
            codeTitle: 'Code B',
          },
        ],
      },
      'several_matches',
    );
    expect(a.warnings).toEqual([
      'Article 1 exists in several codes — call again with "code".',
      'Some codes have several versions in force: for those, give the "id".',
    ]);
    expect(a.code).toBeNull();
    expect(a.candidates.map((c: Answer) => [c.code, c.id])).toEqual([
      ['Code A', 'LEGIARTI000000000001'],
      ['Code A', 'LEGIARTI000000000002'],
      ['Code B', 'LEGIARTI000000000003'],
    ]);
  });

  it('not found by id echoes the requested id', () => {
    const a = answer(
      { kind: 'not_found', reason: 'unknown_id', num: null, codeTitle: null, didYouMean: [] },
      'not_found',
      { requestedId: 'LEGIARTI000000000999' },
    );
    expect(a).toMatchObject({
      warnings: ['No Légifrance article with id LEGIARTI000000000999.'],
      reason: 'unknown_id',
      id: 'LEGIARTI000000000999',
      number: null,
      code: null,
      did_you_mean: [],
    });
  });

  it('not found by number, in one code or in every code', () => {
    const miss = (codeTitle: string | null) =>
      answer(
        { kind: 'not_found', reason: 'no_article', num: '9999', codeTitle, didYouMean: [] },
        'not_found',
      );
    expect(miss(null)).toMatchObject({
      warnings: ['No article 9999 in any code on Légifrance.'],
      reason: 'no_article',
      id: null,
      number: '9999',
      code: null,
    });
    expect(miss('Code civil')).toMatchObject({
      warnings: ['No article 9999 in Code civil on Légifrance.'],
      code: 'Code civil',
    });
  });

  it('an unknown code is never reported as a missing article', () => {
    const a = answer(
      {
        kind: 'not_found',
        reason: 'unknown_code',
        num: 'R413-17',
        codeTitle: 'C. route',
        didYouMean: [],
      },
      'not_found',
    );
    expect(a.reason).toBe('unknown_code');
    expect(a.warnings).toEqual([
      'Unknown code "C. route": no Légifrance code has this title. Use the full title (e.g. "Code de la route") or omit the code.',
    ]);
    expect(JSON.stringify(a)).not.toContain('No article');
  });

  it('an unknown code with code suggestions labels them as such', () => {
    const a = answer(
      {
        kind: 'not_found',
        reason: 'unknown_code',
        num: '1240',
        codeTitle: 'Code civi',
        didYouMean: ['Code civil'],
      },
      'not_found',
    );
    expect(a.did_you_mean).toEqual(['Code civil']);
    expect(a.warnings).toEqual([
      'Unknown code "Code civi": no Légifrance code has this title. Use the full title (e.g. "Code de la route") or omit the code.',
      'Did you mean: Code civil? (suggestions only — call again with the exact code title)',
    ]);
  });

  const period5 = {
    id: 'LEGIARTI000000000005',
    num: '5',
    codeId: 'LEGITEXT000000000001',
    codeTitle: 'Code A',
    status: 'repealed' as const,
    rawStatus: 'ABROGE',
    validFrom: '2000-01-01',
    validTo: '2010-01-01',
    validToUndetermined: false,
  };

  it('not in force at date, across codes, names the code of each period', () => {
    const a = answer(
      {
        kind: 'not_in_force_at_date',
        num: '5',
        codeTitle: null,
        asOf: '1990-01-01',
        periods: [period5],
        warnings: [],
      },
      'not_in_force',
    );
    expect(a).toMatchObject({
      warnings: [
        'Art. 5 exists but was not in force on 1990-01-01.',
        'Call again with an "at_date" inside one of these periods to read that version.',
      ],
      number: '5',
      code: null,
      on: '1990-01-01',
      relocation: null,
    });
    expect(a.periods[0]).toMatchObject({
      code: 'Code A',
      legifrance_status: 'ABROGE',
      from: '2000-01-01',
      until: '2010-01-01',
      until_undetermined: false,
    });
  });

  it('each not-in-force period carries its id and official link', () => {
    const a = answer(
      {
        kind: 'not_in_force_at_date',
        num: '5',
        codeTitle: null,
        asOf: '1990-01-01',
        periods: [period5],
        warnings: [],
      },
      'not_in_force',
    );
    expect(a.periods).toEqual([
      {
        id: 'LEGIARTI000000000005',
        code: 'Code A',
        legifrance_status: 'ABROGE',
        from: '2000-01-01',
        until: '2010-01-01',
        until_undetermined: false,
        link: link('LEGIARTI000000000005'),
      },
    ]);
  });

  it('an end Légifrance has not dated is shown as such, never as "no end"', () => {
    const a = answer(
      {
        kind: 'not_in_force_at_date',
        num: '5',
        codeTitle: 'Code A',
        asOf: '1990-01-01',
        periods: [
          {
            ...period5,
            status: 'repeal_pending',
            rawStatus: 'ABROGE_DIFF',
            validTo: null,
            validToUndetermined: true,
          },
        ],
        warnings: [],
      },
      'not_in_force',
    );
    expect(a.periods[0]).toMatchObject({
      legifrance_status: 'ABROGE_DIFF',
      from: '2000-01-01',
      until: null,
      until_undetermined: true,
    });
  });

  describe('not in force: where the content went, and dates that disagree', () => {
    const period = {
      id: 'LEGIARTI000018532352',
      num: 'R4217-2',
      codeId: 'LEGITEXT000006072050',
      codeTitle: 'Code du travail',
      status: 'repealed' as const,
      rawStatus: 'ABROGE',
      validFrom: '2008-05-01',
      validTo: '2026-10-01',
      validToUndetermined: false,
    };
    const moved = {
      id: 'LEGIARTI000000000400',
      num: 'R4217-9',
      codeTitle: 'Code du travail',
      label: 'Code du travail - art. R4217-9 (V)',
    };
    const notInForce = (
      over: Partial<Extract<GetArticleResult, { kind: 'not_in_force_at_date' }>>,
    ) =>
      answer(
        {
          kind: 'not_in_force_at_date',
          num: 'R4217-2',
          codeTitle: 'Code du travail',
          asOf: TODAY,
          periods: [period],
          warnings: [],
          ...over,
        },
        'not_in_force',
      );

    it('a full page of versions: incomplete, with a warning', () => {
      const a = notInForce({ possiblyIncomplete: true });
      expect(a.incomplete).toBe(true);
      expect(a.warnings).toContain(
        'Légifrance returned a full page of versions: more versions may exist.',
      );
      expect(notInForce({}).incomplete).toBe(false);
    });

    it('past move: labelled per Légifrance concordance, scoped to the last version', () => {
      const a = notInForce({ relocation: { from: period, movedTo: [moved] } });
      expect(a.relocation).toBe(
        'Content moved — per Légifrance concordance, the text of art. R4217-2 (version 2008-05-01 → 2026-10-01) is now at Code du travail - art. R4217-9 (V) (since 2026-10-01).',
      );
      expect(a.warnings[0]).toBe(
        'Art. R4217-2 of Code du travail exists but was not in force on 2026-11-12.',
      );
    });

    it('future move: future tense', () => {
      const later = { ...period, validTo: '2027-01-01' };
      const a = notInForce({
        asOf: '2000-01-01',
        periods: [later],
        relocation: { from: later, movedTo: [moved] },
      });
      expect(a.relocation).toBe(
        'Content will move — per Légifrance concordance, the text of art. R4217-2 (version 2008-05-01 → 2027-01-01) will be at Code du travail - art. R4217-9 (V) from 2027-01-01.',
      );
    });

    it('a period covering the date: no claim that it was not in force, and a warning', () => {
      const warning =
        "Légifrance's dated search found no version for 2015-01-01, but this period covers it: ABROGE 2008-05-01 → 2026-10-01 (LEGIARTI000018532352).";
      const a = notInForce({ asOf: '2015-01-01', warnings: [warning] });
      expect(JSON.stringify(a)).not.toContain('was not in force');
      expect(a.warnings).toEqual([
        "Art. R4217-2 of Code du travail: Légifrance's dated search found no version in force on 2015-01-01. Versions on record.",
        warning,
        'Call again with an "at_date" inside one of these periods to read that version.',
      ]);
    });

    it('other warnings are shown without changing the heading', () => {
      const warning = 'Could not check where this content moved (Légifrance: service unavailable).';
      const a = notInForce({ warnings: [warning] });
      expect(a.warnings[0]).toBe(
        'Art. R4217-2 of Code du travail exists but was not in force on 2026-11-12.',
      );
      expect(a.warnings).toContain(warning);
    });
  });

  it('found, ended with no later version: the concordance move is dated by its end', () => {
    const ref = {
      id: 'LEGIARTI000000000009',
      num: '8',
      codeTitle: 'Code civil',
      label: 'Code civil - art. 8',
    };
    const relocation = (validTo: string | null) => ({
      change: 'replaced' as const,
      movedTo: [ref],
      evidence: ['concordance' as const],
      from: summary({ id: 'LEGIARTI000000000001', validFrom: '2010-01-01', validTo }),
      successor: null,
    });
    expect(
      answer(found({ asOf: '2015-01-01', relocation: relocation('2026-10-01') }), 'found')
        .relocation,
    ).toBe(
      'Content moved — per Légifrance concordance, the text of art. 7 as of 2015-01-01 is now at Code civil - art. 8 (since 2026-10-01).',
    );
    expect(answer(found({ relocation: relocation(null) }), 'found').relocation).toBe(
      'Content moved — per Légifrance concordance, the text of art. 7 as of 2026-11-12 is now at Code civil - art. 8.',
    );
  });

  it('found with an undetermined end: status, warning and versions say so', () => {
    const base = view();
    const version = {
      ...base.record.version,
      status: 'repeal_pending' as const,
      rawStatus: 'ABROGE_DIFF',
      validToUndetermined: true,
    };
    const a = answer(
      found({
        record: {
          ...base.record,
          version,
          versions: [
            summary({
              id: version.id,
              status: 'repeal_pending',
              rawStatus: 'ABROGE_DIFF',
              validFrom: '2010-01-01',
              validToUndetermined: true,
            }),
          ],
        },
        warnings: ['Repeal scheduled; Légifrance has not set its date.'],
      }),
      'found',
      { detailed: true },
    );
    expect(a.status).toEqual({
      state: 'in_force',
      on: '2026-11-12',
      from: '2010-01-01',
      until: null,
      until_undetermined: true,
    });
    expect(a.legifrance_status).toBe('ABROGE_DIFF');
    expect(a.warnings).toContain('Repeal scheduled; Légifrance has not set its date.');
    expect(a.versions).toEqual([
      {
        id: 'LEGIARTI000000000001',
        version: '2.0',
        legifrance_status: 'ABROGE_DIFF',
        from: '2010-01-01',
        until: null,
        until_undetermined: true,
        shown: true,
      },
    ]);
  });

  describe('per-call deadline', () => {
    it('answers the deadline error, with the request, when the service outlives it', async () => {
      const client = await connect({
        config: sandboxConfig(),
        getStatus: () => Promise.reject(new Error('not used')),
        sources: [
          createLegifranceSource(
            fakeServices(
              (_input, ctx) =>
                new Promise((_resolve, reject) => {
                  ctx?.signal?.addEventListener('abort', () =>
                    reject(new VigueurError('cancelled', 'cancelled')),
                  );
                }),
            ),
            { today: () => TODAY, deadlineMs: 20 },
          ),
        ],
      });
      const result = await client.callTool({ name: TOOL, arguments: { number: '7' } });
      const e = expectToolError(result, 'deadline');
      expect(e.source).toBe('Légifrance');
      expect(e.error.message).toContain('did not answer within');
      expect(e.request).toEqual(REQUEST);
      expect('retrieved' in e).toBe(false);
    });
  });
});
