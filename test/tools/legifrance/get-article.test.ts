import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import type * as z from 'zod/v4';
import { compose } from '../../../src/compose.js';
import { loadConfig } from '../../../src/config.js';
import type { ServerDeps } from '../../../src/server.js';
import type {
  ArticleView,
  GetArticleInput,
  GetArticleResult,
} from '../../../src/services/legislation/get-article.js';
import type { CallContext, VersionSummary } from '../../../src/services/legislation/ports.js';
import { MAX_TOOL_TEXT } from '../../../src/tools/format.js';
import { renderGetArticle } from '../../../src/tools/legifrance/get-article.js';
import {
  createLegifranceSource,
  type LegifranceServices,
} from '../../../src/tools/legifrance/index.js';
import {
  type GetArticleOutput,
  getArticleOutputSchema,
  type TextPage,
} from '../../../src/tools/legifrance/schemas.js';
import { fixtureFetch, sandboxConfig } from '../../helpers/fixture-fetch.js';
import { connectClient, firstText } from '../../helpers/mcp-client.js';

const TOOL = 'legifrance_get_article';

let cleanup: Array<() => Promise<void>> = [];
let unmatchedRoutes: string[][] = [];

afterEach(async () => {
  for (const close of cleanup.reverse()) await close();
  cleanup = [];
  for (const unmatched of unmatchedRoutes)
    expect(unmatched, 'requests without a fixture').toEqual([]);
  unmatchedRoutes = [];
});

async function connect(deps: ServerDeps) {
  const { client, close } = await connectClient(deps);
  cleanup.push(close);
  return client;
}

/** A client over the composed server, answering PISTE from the Légifrance fixtures. */
async function composedClient() {
  const fixtures = fixtureFetch();
  unmatchedRoutes.push(fixtures.unmatched);
  return connect(compose(sandboxConfig(), { fetch: fixtures.fetch }));
}

async function call(args: Record<string, unknown>) {
  const client = await composedClient();
  const result = await client.callTool({ name: TOOL, arguments: args });
  return { result, text: firstText(result) };
}

describe('legifrance_get_article over the composed server (fixtures)', () => {
  it('Code civil 1240 today: official text, in force, link', async () => {
    const { result, text } = await call({ code: 'Code civil', number: '1240' });
    expect(result.isError).toBeFalsy();
    expect(text).toContain('### Code civil — art. 1240');
    expect(text).toContain('Tout fait quelconque');
    expect(text).toContain('✅ In force on');
    expect(text).toContain('(since 2016-10-01, no end date) (VIGUEUR)');
    expect(text).toContain(
      'Livre III : Des différentes manières dont on acquiert la propriété › Titre III : Des sources d',
    );
    expect(text).toContain(
      'Source: https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032041571',
    );
    expect(text).toContain('Légifrance id: LEGIARTI000032041571');
    expect(text).not.toContain('#### Versions');
    const structured = result.structuredContent as GetArticleResult;
    expect(structured.kind).toBe('found');
  });

  it('L1234-1 without a code lists both codes instead of picking one', async () => {
    const { result, text } = await call({ number: 'L1234-1' });
    expect(result.isError).toBeFalsy();
    expect(text).toContain('Article L1234-1 exists in several codes — call again with "code":');
    expect(text).toContain('- Code du travail (in force since 2008-05-01)');
    expect(text).toContain('- Code de la santé publique (in force since 2004-08-07)');
    expect((result.structuredContent as GetArticleResult).kind).toBe('ambiguous');
  });

  it('Code civil 1382 on 2015-01-01: old text, and where its content moved', async () => {
    const { result, text } = await call({
      code: 'Code civil',
      number: '1382',
      at_date: '2015-01-01',
    });
    expect(result.isError).toBeFalsy();
    expect(text).toContain('Tout fait quelconque');
    expect(text).toContain(
      '✅ In force on 2015-01-01 (since 1804-03-21, until 2016-10-01) (MODIFIE)',
    );
    expect(text).toContain(
      'Content moved — per Légifrance concordance, the text of art. 1382 as of 2015-01-01 is now at Code civil - art. 1240 (V)',
    );
  });

  it('a repealed article is reported with its periods, not as not found', async () => {
    const { result, text } = await call({ code: 'Code du travail', number: 'R4217-2' });
    expect(result.isError).toBeFalsy();
    expect(text).toMatch(/^Art\. R4217-2 of Code du travail exists but was not in force on \d{4}-/);
    expect(text).toContain('- ABROGE 2008-05-01 → 2026-10-01');
  });

  it('detailed adds the versions table, modifications and citation count', async () => {
    const { text } = await call({
      code: 'Code civil',
      number: '1382',
      at_date: '2015-01-01',
      response_format: 'detailed',
    });
    expect(text).toContain('| Version | Status | From | Until |');
    expect(text).toContain('| 1.0 (shown) | MODIFIE | 1804-03-21 | 2016-10-01 |');
    expect(text).toContain('| 2.0 | VIGUEUR | 2016-10-01 | no end |');
    expect(text).toContain('- Created by Loi 1804-02-09 promulguée le 19 février 1804');
    expect(text).toContain('Cited by 65 texts');
  });

  it('blank optional inputs count as absent', async () => {
    const { result, text } = await call({ number: 'L1234-1', code: '', at_date: '', id: '' });
    expect(result.isError).toBeFalsy();
    expect(text).toContain('Code de la santé publique');
  });

  it('an unknown code is reported as such, without searching any article', async () => {
    const { result, text } = await call({ code: 'C. route', number: 'R413-17' });
    expect(result.isError).toBeFalsy();
    expect(text).toContain('Unknown code "C. route": no Légifrance code has this title.');
    expect(result.structuredContent).toMatchObject({ kind: 'not_found', reason: 'unknown_code' });
    expect(getArticleOutputSchema.safeParse(result.structuredContent).success).toBe(true);
  });

  it('rejects an impossible date', async () => {
    const { result, text } = await call({ at_date: '2015-13-01', number: '1240' });
    expect(result.isError).toBe(true);
    expect(text).toContain('YYYY-MM-DD');
  });

  it('rejects a call without number or id', async () => {
    const { result, text } = await call({});
    expect(result.isError).toBe(true);
    expect(text).toContain('Give an article number with its code');
  });

  it('is listed with annotations and an object output schema only when configured', async () => {
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
// The tool over fake services: signal, truncation.

function fakeServices(getArticle: LegifranceServices['getArticle']): LegifranceServices {
  const unused = () => Promise.reject(new Error('not used in these tests'));
  return { getArticle, getArticleHistory: unused, searchLegislation: unused, listChanges: unused };
}

async function clientOver(getArticle: LegifranceServices['getArticle']) {
  return connect({
    config: sandboxConfig(),
    getStatus: () => Promise.reject(new Error('not used')),
    sources: [createLegifranceSource(fakeServices(getArticle), { today: () => '2026-11-12' })],
  });
}

const TODAY = '2026-11-12';

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
      codeId: 'LEGITEXT000006070721',
      codeTitle: 'Code civil',
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
    url: 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000000000001',
    relocation: null,
    ...over,
  };
}

const found = (over?: Partial<ArticleView>, text?: string): GetArticleResult => ({
  kind: 'found',
  article: view(over, text),
});

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
    expect(seen[0]?.ctx?.signal).toBeInstanceOf(AbortSignal);
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

  it('found: structured content leaves the article text out and says which part was sent', async () => {
    const client = await clientOver(async () => found());
    const result = await client.callTool({ name: TOOL, arguments: { number: '7' } });
    const structured = result.structuredContent as GetArticleOutput;
    expect(structured.kind).toBe('found');
    if (structured.kind !== 'found') return;
    expect(structured.article.record.version).not.toHaveProperty('text');
    expect(structured.textPage).toEqual({ offset: 0, nextOffset: null, totalLength: 15 });
    expect(firstText(result)).toContain('Texte officiel.');
  });

  it('rejects an offset past the end of the article text', async () => {
    const client = await clientOver(async () => found());
    const result = await client.callTool({ name: TOOL, arguments: { number: '7', offset: 15 } });
    expect(result.isError).toBe(true);
    expect(firstText(result)).toContain('past the end');
  });

  it('returns service failures as tool errors', async () => {
    const client = await clientOver(() => Promise.reject(new Error('boom')));
    const result = await client.callTool({ name: TOOL, arguments: { number: '7' } });
    expect(result.isError).toBe(true);
    expect(firstText(result)).toContain('boom');
  });
});

// ---------------------------------------------------------------------------------------------
// Long articles: only the article text is paginated, inside the same frame on every page.

interface Page {
  text: string;
  textPage: TextPage;
  structuredLength: number;
}

type Client = Awaited<ReturnType<typeof clientOver>>;

async function readAllPages(client: Client, args: Record<string, unknown>): Promise<Page[]> {
  const pages: Page[] = [];
  let offset = 0;
  for (let i = 0; i < 50; i++) {
    const result = await client.callTool({
      name: TOOL,
      arguments: offset > 0 ? { ...args, offset } : args,
    });
    expect(result.isError, firstText(result)).toBeFalsy();
    const structured = result.structuredContent as GetArticleOutput;
    if (structured.kind !== 'found') throw new Error(`expected an article, got ${structured.kind}`);
    pages.push({
      text: firstText(result),
      textPage: structured.textPage,
      structuredLength: JSON.stringify(structured).length,
    });
    if (structured.textPage.nextOffset === null) return pages;
    offset = structured.textPage.nextOffset;
  }
  throw new Error('more than 50 pages');
}

function expectBoundedPages(pages: Page[]) {
  for (const page of pages) {
    expect(page.text.length).toBeLessThanOrEqual(MAX_TOOL_TEXT);
    expect(page.structuredLength).toBeLessThan(15_000);
  }
}

const STATUS_LINE = '✅ In force on 2026-11-12 (since 2010-01-01, no end date) (VIGUEUR)';
const SOURCE_LINE = 'Source: https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000000000001';

describe('legifrance_get_article on a long article', () => {
  const longText = Array.from(
    { length: 3400 },
    (_, i) => `Alinéa ${i} : texte officiel de l'article, cité tel quel.`,
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
    '%s: every page keeps the frame, stays bounded, and the pages rebuild the text',
    async (format) => {
      const client = await clientOver(async () => longArticle);
      const pages = await readAllPages(client, { number: '7', response_format: format });
      expect(pages.length).toBeGreaterThanOrEqual(5);
      expectBoundedPages(pages);

      const slices: string[] = [];
      let expectedOffset = 0;
      for (const [i, page] of pages.entries()) {
        expect(page.text).toContain(STATUS_LINE);
        expect(page.text).toContain('Livre Ier › Titre II');
        expect(page.text).toContain('Note: Une note.');
        expect(page.text).toContain('⚠️ Légifrance marks this version in force');
        expect(page.text).toContain(SOURCE_LINE);
        expect(page.text).toContain('Légifrance id: LEGIARTI000000000001');
        expect(page.text.includes('#### Versions') || page.text.includes('Cited by')).toBe(
          format === 'detailed',
        );
        expect(page.textPage.offset).toBe(expectedOffset);
        expect(page.textPage.totalLength).toBe(longText.length);

        // The article text sits between the header (and continuation mark) and the trailer.
        let body = page.text.slice(page.text.indexOf('Titre II\n\n') + 'Titre II\n\n'.length);
        body = body.slice(0, body.indexOf('\n\nNote: Une note.'));
        const continued = `(continued from character ${page.textPage.offset})\n\n`;
        expect(body.startsWith(continued)).toBe(i > 0);
        if (i > 0) body = body.slice(continued.length);
        const { nextOffset } = page.textPage;
        const notice = `\n\n[Truncated — call again with "offset": ${nextOffset}]`;
        expect(body.endsWith(notice)).toBe(nextOffset !== null);
        if (nextOffset !== null) body = body.slice(0, -notice.length);
        slices.push(body);
        expectedOffset = nextOffset ?? -1;
      }
      expect(pages.at(-1)?.textPage.nextOffset).toBeNull();
      expect(slices.join('')).toBe(longText);
    },
  );

  it('offsets index the article text, whatever the response format', async () => {
    const client = await clientOver(async () => longArticle);
    const result = await client.callTool({
      name: TOOL,
      arguments: { number: '7', offset: 100_000, response_format: 'detailed' },
    });
    const text = firstText(result);
    expect(text).toContain('(continued from character 100000)');
    expect(text).toContain(longText.slice(100_000, 100_200));
  });

  it('CGI art. 199 undecies B by id (fixture 59): bounded text pages and slim structured content', async () => {
    const client = await composedClient();
    for (const format of ['concise', 'detailed']) {
      const pages = await readAllPages(client, {
        id: 'LEGIARTI000046892900',
        response_format: format,
      });
      expectBoundedPages(pages);
      for (const page of pages) {
        expect(page.text).toContain('### Code général des impôts — art. 199 undecies B');
        expect(page.text).toContain('✅ In force on');
        expect(page.text).toContain('Légifrance id: LEGIARTI000046892900');
      }
    }
  });
});

// ---------------------------------------------------------------------------------------------

const render = (r: GetArticleResult, opts: { detailed?: boolean; requestedId?: string } = {}) =>
  renderGetArticle(r, { detailed: false, today: TODAY, requestedId: null, offset: 0, ...opts })
    .text;

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

describe('renderGetArticle', () => {
  it('found: heading, status, breadcrumb, text, note, warnings, footer — in order', () => {
    const text = render(
      found({
        record: {
          ...view().record,
          nota: 'Conformément à l’article 9, ces dispositions entrent en vigueur le 1er janvier 2010.',
          sectionPath: ['Livre Ier', 'Titre II'],
        },
        warnings: ['Légifrance marks this version in force, but also records its abrogation.'],
      }),
    );
    expect(text).toBe(
      [
        '### Code civil — art. 7\n✅ In force on 2026-11-12 (since 2010-01-01, no end date) (VIGUEUR)\nLivre Ier › Titre II',
        'Texte officiel.',
        'Note: Conformément à l’article 9, ces dispositions entrent en vigueur le 1er janvier 2010.',
        '⚠️ Légifrance marks this version in force, but also records its abrogation.',
        'Source: https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000000000001\nLégifrance id: LEGIARTI000000000001',
      ].join('\n\n'),
    );
  });

  it('relocation without concordance: inferred from text comparison, past tense', () => {
    const text = render(
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
    );
    expect(text).toContain(
      'The content of this article was amended on 2020-01-01 (inferred from text comparison).',
    );
  });

  it('relocation after today: future tense', () => {
    const text = render(
      found({
        relocation: {
          change: 'replaced',
          movedTo: [],
          evidence: ['text_similarity'],
          from: summary({ id: 'LEGIARTI000000000001' }),
          successor: summary({ validFrom: '2027-01-01' }),
        },
      }),
    );
    expect(text).toContain(
      'The content of this article will be replaced on 2027-01-01 (inferred from text comparison).',
    );
  });

  it('relocation per concordance after today: future tense', () => {
    const text = render(
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
    );
    expect(text).toContain(
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
    const text = render({
      kind: 'ambiguous',
      num: '1',
      candidates: [
        { ...hit, id: 'LEGIARTI000000000001', codeId: 'LEGITEXT000000000001', codeTitle: 'Code A' },
        { ...hit, id: 'LEGIARTI000000000002', codeId: 'LEGITEXT000000000002', codeTitle: 'Code B' },
      ],
      possiblyIncomplete: true,
    });
    expect(text).toBe(
      [
        'Article 1 exists in several codes — call again with "code":',
        '- Code A (in force since 2000-01-01)',
        '- Code B (in force since 2000-01-01)',
        '(Only the first matches are listed — give the code to narrow it down.)',
      ].join('\n'),
    );
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
    const text = render({
      kind: 'ambiguous',
      num: '1',
      candidates: [
        { ...hit, id: 'LEGIARTI000000000001', validFrom: '2000-01-01' },
        { ...hit, id: 'LEGIARTI000000000002', validFrom: '2001-01-01' },
      ],
    });
    expect(text).toContain(
      'Article 1 has several versions in force in Code A — call again with "id":',
    );
    expect(text).toContain('- LEGIARTI000000000002 (in force since 2001-01-01, VIGUEUR)');
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
    const text = render({
      kind: 'ambiguous',
      num: '1',
      candidates: [
        { ...hit, id: 'LEGIARTI000000000001', codeId: 'LEGITEXT000000000001', codeTitle: 'Code A' },
        { ...hit, id: 'LEGIARTI000000000002', codeId: 'LEGITEXT000000000001', codeTitle: 'Code A' },
        { ...hit, id: 'LEGIARTI000000000003', codeId: 'LEGITEXT000000000002', codeTitle: 'Code B' },
      ],
    });
    expect(text).toContain('Article 1 exists in several codes — call again with "code":');
    expect(text).toContain('- Code A (in force since 2000-01-01) · id LEGIARTI000000000002');
    expect(text).toContain('- Code B (in force since 2000-01-01) · id LEGIARTI000000000003');
    expect(text).toContain('give the "id"');
  });

  it('not found by id echoes the requested id', () => {
    const text = render(
      { kind: 'not_found', reason: 'unknown_id', num: null, codeTitle: null, didYouMean: [] },
      { requestedId: 'LEGIARTI000000000999' },
    );
    expect(text).toBe('No Légifrance article with id LEGIARTI000000000999.');
  });

  it('not found by number, in one code or in every code', () => {
    expect(
      render({
        kind: 'not_found',
        reason: 'no_article',
        num: '9999',
        codeTitle: null,
        didYouMean: [],
      }),
    ).toBe('No article 9999 in any code on Légifrance.');
    expect(
      render({
        kind: 'not_found',
        reason: 'no_article',
        num: '9999',
        codeTitle: 'Code civil',
        didYouMean: [],
      }),
    ).toBe('No article 9999 in Code civil on Légifrance.');
  });

  it('an unknown code is never reported as a missing article', () => {
    const text = render({
      kind: 'not_found',
      reason: 'unknown_code',
      num: 'R413-17',
      codeTitle: 'C. route',
      didYouMean: [],
    });
    expect(text).toBe(
      'Unknown code "C. route": no Légifrance code has this title. Use the full title (e.g. "Code de la route") or omit the code.',
    );
    expect(text).not.toContain('No article');
  });

  it('an unknown code with code suggestions labels them as such', () => {
    const text = render({
      kind: 'not_found',
      reason: 'unknown_code',
      num: '1240',
      codeTitle: 'Code civi',
      didYouMean: ['Code civil'],
    });
    expect(text).toBe(
      [
        'Unknown code "Code civi": no Légifrance code has this title. Use the full title (e.g. "Code de la route") or omit the code.',
        'Did you mean: Code civil? (suggestions only — call again with the exact code title)',
      ].join('\n'),
    );
  });

  it('not in force at date, across codes, names the code of each period', () => {
    const text = render({
      kind: 'not_in_force_at_date',
      num: '5',
      codeTitle: null,
      asOf: '1990-01-01',
      periods: [
        {
          id: 'LEGIARTI000000000005',
          num: '5',
          codeId: 'LEGITEXT000000000001',
          codeTitle: 'Code A',
          status: 'repealed',
          rawStatus: 'ABROGE',
          validFrom: '2000-01-01',
          validTo: '2010-01-01',
          validToUndetermined: false,
        },
      ],
    });
    expect(text).toContain('Art. 5 exists but was not in force on 1990-01-01:');
    expect(text).toContain('- ABROGE 2000-01-01 → 2010-01-01 (Code A)');
  });

  it('an end Légifrance has not dated is shown as such, never as "no end"', () => {
    const period = {
      id: 'LEGIARTI000000000005',
      num: '5',
      codeId: 'LEGITEXT000000000001',
      codeTitle: 'Code A',
      status: 'repeal_pending' as const,
      rawStatus: 'ABROGE_DIFF',
      validFrom: '2000-01-01',
      validTo: null,
      validToUndetermined: true,
    };
    const text = render({
      kind: 'not_in_force_at_date',
      num: '5',
      codeTitle: 'Code A',
      asOf: '1990-01-01',
      periods: [period],
    });
    expect(text).toContain('- ABROGE_DIFF 2000-01-01 → date not yet determined');
  });

  it('found with an undetermined end: status line, warning and versions table say so', () => {
    const base = view();
    const version = {
      ...base.record.version,
      status: 'repeal_pending' as const,
      rawStatus: 'ABROGE_DIFF',
      validToUndetermined: true,
    };
    const text = render(
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
      { detailed: true },
    );
    expect(text).toContain(
      '✅ In force on 2026-11-12 (since 2010-01-01, until a date not yet determined) (ABROGE_DIFF)',
    );
    expect(text).toContain('⚠️ Repeal scheduled; Légifrance has not set its date.');
    expect(text).toContain('| 2.0 (shown) | ABROGE_DIFF | 2010-01-01 | not yet determined |');
  });
});

describe('getArticleOutputSchema', () => {
  it('mirrors GetArticleOutput exactly', () => {
    expectTypeOf<z.infer<typeof getArticleOutputSchema>>().toEqualTypeOf<GetArticleOutput>();
  });

  it('accepts the structured output of a found article', () => {
    const { output } = renderGetArticle(found(), {
      detailed: false,
      today: TODAY,
      requestedId: null,
      offset: 0,
    });
    expect(getArticleOutputSchema.safeParse(output).success).toBe(true);
  });
});
