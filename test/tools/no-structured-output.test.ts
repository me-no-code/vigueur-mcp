import { afterEach, describe, expect, it } from 'vitest';
import { compose } from '../../src/compose.js';
import { loadConfig } from '../../src/config.js';
import { fixtureFetch, sandboxConfig } from '../helpers/fixture-fetch.js';
import { connectClient, firstText } from '../helpers/mcp-client.js';

// The rendered text is the product and the model's only consumer: a tool that declares an
// `outputSchema` makes clients pass `structuredContent` to the model instead of the text.

let cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const close of cleanup.reverse()) await close();
  cleanup = [];
});

async function connect(deps: Parameters<typeof connectClient>[0]) {
  const { client, close } = await connectClient(deps);
  cleanup.push(close);
  return client;
}

describe('tools answer with text only', () => {
  it('no tool declares an outputSchema', async () => {
    const client = await connect(compose(sandboxConfig(), { fetch: fixtureFetch().fetch }));
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(
      expect.arrayContaining([
        'legifrance_get_article',
        'legifrance_get_text',
        'legifrance_browse_code',
        'legifrance_latest_jo',
        'legifrance_list_reference_values',
        'legifrance_search_case_law',
        'legifrance_get_decision',
        'judilibre_search_decisions',
        'judilibre_get_decision',
        'judilibre_list_taxonomy',
      ]),
    );
    for (const tool of tools) expect(tool.outputSchema, tool.name).toBeUndefined();
  });

  it('vigueur_status (unconfigured) returns the setup guide as text, no structuredContent', async () => {
    const client = await connect(compose(loadConfig({})));
    const result = await client.callTool({ name: 'vigueur_status' });
    expect(result.structuredContent).toBeUndefined();
    const text = firstText(result);
    expect(text).toContain('PISTE_CLIENT_ID');
    expect(text).toContain('Validate my ToS choices');
  });

  it('legifrance_get_article returns the article and its link as text, no structuredContent', async () => {
    const client = await connect(compose(sandboxConfig(), { fetch: fixtureFetch().fetch }));
    const result = await client.callTool({
      name: 'legifrance_get_article',
      arguments: { code: 'Code civil', number: '1240' },
    });
    expect(result.structuredContent).toBeUndefined();
    const text = firstText(result);
    expect(text).toContain('Tout fait quelconque');
    expect(text).toContain(
      'Source: https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032041571',
    );
  });

  it('legifrance_get_article with neighbours returns text only, no structuredContent', async () => {
    const client = await connect(compose(sandboxConfig(), { fetch: fixtureFetch().fetch }));
    const result = await client.callTool({
      name: 'legifrance_get_article',
      arguments: { code: 'Code civil', number: '1240', include_neighbours: true },
    });
    expect(result.structuredContent).toBeUndefined();
    expect(firstText(result)).toContain('- Next: art. 1241');
  });

  it('legifrance_get_text returns the text and its link as text, no structuredContent', async () => {
    const client = await connect(compose(sandboxConfig(), { fetch: fixtureFetch().fetch }));
    for (const part of ['outline', 'articles']) {
      const result = await client.callTool({
        name: 'legifrance_get_text',
        arguments: { nature: 'loi', number: '78-17', part },
      });
      expect(result.structuredContent, part).toBeUndefined();
      expect(firstText(result)).toContain(
        'Source: https://www.legifrance.gouv.fr/loda/id/LEGITEXT000006068624',
      );
    }
  });

  it('legifrance_browse_code returns the table of contents as text, no structuredContent', async () => {
    const client = await connect(compose(sandboxConfig(), { fetch: fixtureFetch().fetch }));
    const result = await client.callTool({
      name: 'legifrance_browse_code',
      arguments: { code: 'Code du travail' },
    });
    expect(result.structuredContent).toBeUndefined();
    expect(firstText(result)).toContain('section_id LEGISCTA000006112874');
  });

  it('the case-law tools return text only, no structuredContent', async () => {
    const client = await connect(compose(sandboxConfig(), { fetch: fixtureFetch().fetch }));
    for (const [name, args] of [
      ['legifrance_search_case_law', { collection: 'constitutional', number: '2026-1217' }],
      ['legifrance_get_decision', { id: 'JURITEXT000099999999' }],
    ] as const) {
      const result = await client.callTool({ name, arguments: args });
      expect(result.structuredContent, name).toBeUndefined();
    }
  });

  it.each([
    ['legifrance_latest_jo', {}, 'Published 2026-11-11'],
    ['legifrance_list_reference_values', { kind: 'codes' }, 'Code civil'],
  ])('%s returns text only, no structuredContent', async (name, args, expected) => {
    const client = await connect(compose(sandboxConfig(), { fetch: fixtureFetch().fetch }));
    const result = await client.callTool({ name, arguments: args });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toBeUndefined();
    expect(firstText(result)).toContain(expected);
  });
});
