import { describe, expect, it } from 'vitest';
import type { GetTextInput } from '../../../src/services/legislation/get-text.js';
import type { CallContext } from '../../../src/services/legislation/ports.js';
import { VigueurError } from '../../../src/shared/errors.js';
import {
  createLegifranceSource,
  type LegifranceServices,
} from '../../../src/tools/legifrance/index.js';
import { expectAnswer, expectToolError } from '../../helpers/answer.js';
import { useServers } from '../../helpers/composed-server.js';
import { sandboxConfig } from '../../helpers/fixture-fetch.js';
import { article, foundText, NOW, record, TODAY } from '../../helpers/get-text-builders.js';

const TOOL = 'legifrance_get_text';
const SOURCE = 'Légifrance';
const FOUND = { source: SOURCE, outcome: 'found' };
const NO_RESULTS = { source: SOURCE, outcome: 'no_results' };

const { connect } = useServers();

function fakeServices(getText: LegifranceServices['getText']): LegifranceServices {
  const unused = () => Promise.reject(new Error('not used in these tests'));
  return {
    getArticle: unused,
    getArticleHistory: unused,
    searchLegislation: unused,
    listChanges: unused,
    getText,
    browseCode: unused,
    latestJo: unused,
    listReferenceValues: unused,
    searchCaseLaw: unused,
    getDecision: unused,
  };
}

async function clientOver(getText: LegifranceServices['getText'], deadlineMs?: number) {
  return connect({
    config: sandboxConfig(),
    getStatus: () => Promise.reject(new Error('not used')),
    sources: [
      createLegifranceSource(fakeServices(getText), {
        today: () => TODAY,
        now: () => NOW,
        ...(deadlineMs !== undefined && { deadlineMs }),
      }),
    ],
  });
}

describe('legifrance_get_text handler', () => {
  it('passes the inputs (blank → absent) and the abort signal to the service', async () => {
    const seen: Array<{ input: GetTextInput; ctx: CallContext | undefined }> = [];
    const client = await clientOver(async (input, ctx) => {
      seen.push({ input, ctx });
      return foundText(record());
    });
    const blank = await client.callTool({
      name: TOOL,
      arguments: {
        id: '',
        nor: ' ',
        nature: 'loi',
        number: ' 2010-1 ',
        at_date: '',
        section_id: '',
      },
    });
    await client.callTool({
      name: TOOL,
      arguments: { id: ' LEGITEXT000000000001 ', at_date: '2020-01-01', section_id: 'LEGISCTA1' },
    });
    expect(seen).toHaveLength(2);
    expect(seen[0]?.input).toEqual({ nature: 'loi', number: '2010-1' });
    expect(seen[1]?.input).toEqual({
      id: 'LEGITEXT000000000001',
      atDate: '2020-01-01',
      sectionCid: 'LEGISCTA1',
    });
    expect(seen[0]?.ctx?.signal).toBeInstanceOf(AbortSignal);
    // Blank inputs are left out of the request; defaults are filled in.
    expect(expectAnswer(blank, FOUND).request).toEqual({
      tool: TOOL,
      nature: 'loi',
      number: '2010-1',
      at_date: TODAY,
      part: 'outline',
      page: 1,
    });
  });

  it('found: the request with its defaults, and the time from the injected clock', async () => {
    const client = await clientOver(async () => foundText(record()));
    const a = expectAnswer(
      await client.callTool({ name: TOOL, arguments: { id: 'LEGITEXT000000000001' } }),
      FOUND,
    );
    expect(a.request).toEqual({
      tool: TOOL,
      id: 'LEGITEXT000000000001',
      at_date: TODAY,
      part: 'outline',
      page: 1,
    });
    expect(a.retrieved).toBe('2026-11-12T09:30:15Z');
    expect(a.cached).toEqual([]);
  });

  it('a text read as published (JORFTEXT id or NOR) gets no at_date default', async () => {
    const client = await clientOver(async () => foundText(record()));
    const byId = expectAnswer(
      await client.callTool({ name: TOOL, arguments: { id: 'JORFTEXT000000000001' } }),
      FOUND,
    );
    expect(byId.request).toEqual({
      tool: TOOL,
      id: 'JORFTEXT000000000001',
      part: 'outline',
      page: 1,
    });
    const byNor = expectAnswer(
      await client.callTool({ name: TOOL, arguments: { nor: 'ABCD0000001D', part: 'articles' } }),
      FOUND,
    );
    expect(byNor.request).toEqual({ tool: TOOL, nor: 'ABCD0000001D', part: 'articles', page: 1 });
  });

  it('rejects a nature outside the enum', async () => {
    const client = await clientOver(async () => foundText(record()));
    const result = await client.callTool({
      name: TOOL,
      arguments: { nature: 'circulaire', number: '1' },
    });
    expect(result.isError).toBe(true);
  });

  it('a page past the end is no_results, with the same fields as the last page', async () => {
    const client = await clientOver(async () =>
      foundText(record({ articles: [article(1), article(2)] })),
    );
    const args = { id: 'LEGITEXT000000000001', part: 'articles' };
    const last = expectAnswer(await client.callTool({ name: TOOL, arguments: args }), FOUND);
    const past = expectAnswer(
      await client.callTool({ name: TOOL, arguments: { ...args, page: 2 } }),
      NO_RESULTS,
    );
    expect(Object.keys(past)).toEqual(Object.keys(last));
    expect(past.items).toEqual([]);
    expect(past.page).toEqual({ number: 2, of: 1 });
    expect(past.next).toBeNull();
    expect(past.results).toBe(2);
    expect(past.article_count).toBe(2);
    expect(past.warnings).toEqual([]);
    expect(past.request.page).toBe(2);
  });

  it('service errors are JSON tool errors with the request; the deadline has its own message', async () => {
    const failing = await clientOver(() =>
      Promise.reject(new VigueurError('invalid_input', 'Give exactly one target.')),
    );
    const failed = expectToolError(
      await failing.callTool({ name: TOOL, arguments: { number: '1' } }),
      'invalid_input',
    );
    expect(failed.error.message).toContain('Give exactly one target.');
    expect(failed.request).toEqual({
      tool: TOOL,
      number: '1',
      at_date: TODAY,
      part: 'outline',
      page: 1,
    });
    expect(failed).not.toHaveProperty('retrieved');

    const slow = await clientOver(
      (_input, ctx) =>
        new Promise((_resolve, reject) => {
          ctx?.signal?.addEventListener('abort', () =>
            reject(new VigueurError('cancelled', 'cancelled')),
          );
        }),
      20,
    );
    const late = expectToolError(
      await slow.callTool({ name: TOOL, arguments: { id: 'LEGITEXT000000000001' } }),
      'deadline',
    );
    expect(late.error.message).toContain('did not answer within');
    expect(late.request.id).toBe('LEGITEXT000000000001');
    expect(late).not.toHaveProperty('retrieved');
  });
});
