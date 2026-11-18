import { describe, expect, it, vi } from 'vitest';
import { htmlToText } from '../../../src/clients/html.js';
import type {
  GetArticleInput,
  GetArticleResult,
} from '../../../src/services/legislation/get-article.js';
import type { CallContext } from '../../../src/services/legislation/ports.js';
import { MAX_TOOL_TEXT } from '../../../src/tools/format.js';
import {
  createLegifranceSource,
  type LegifranceServices,
} from '../../../src/tools/legifrance/index.js';
import { expectAnswer, expectToolError } from '../../helpers/answer.js';
import { readAllPages, useServers } from '../../helpers/composed-server.js';
import { loadFixture } from '../../helpers/fake-piste-http.js';
import {
  bodyField,
  type FixtureRoute,
  LEGIFRANCE_FIXTURE_ROUTES,
  sandboxConfig,
} from '../../helpers/fixture-fetch.js';
import {
  fakeServices,
  found,
  link,
  NOW,
  REQUEST,
  TODAY,
  view,
} from '../../helpers/get-article-builders.js';

const TOOL = 'legifrance_get_article';
const SOURCE = 'Légifrance';
const FOUND = { source: SOURCE, outcome: 'found' };

type Answer = ReturnType<typeof expectAnswer>;

const { connect, composed } = useServers();

// ---------------------------------------------------------------------------------------------
// The tool over fake services: signal, request echo, errors.

async function clientOver(getArticle: LegifranceServices['getArticle']) {
  return connect({
    config: sandboxConfig(),
    getStatus: () => Promise.reject(new Error('not used')),
    sources: [
      createLegifranceSource(fakeServices(getArticle), { today: () => TODAY, now: () => NOW }),
    ],
  });
}

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
      const pages = await readAllPages(
        client,
        TOOL,
        { number: '7', response_format: format },
        FOUND,
      );
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
    const client = await composed();
    const texts: string[] = [];
    for (const format of ['concise', 'detailed']) {
      const pages = await readAllPages(client, TOOL, { id: CGI, response_format: format }, FOUND);
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

    const client = await composed({ routes: [longCgi, ...LEGIFRANCE_FIXTURE_ROUTES] });
    for (const format of ['concise', 'detailed']) {
      const pages = await readAllPages(client, TOOL, { id: CGI, response_format: format }, FOUND);
      expect(pages.length).toBeGreaterThanOrEqual(2);
      for (const page of pages) {
        expect(page.id).toBe(CGI);
        expect(page.status.state).toBe('in_force');
      }
      expectChain(pages, full);
    }
  });
});
