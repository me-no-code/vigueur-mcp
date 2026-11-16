import { afterEach, describe, expect, it } from 'vitest';
import { compose } from '../../src/compose.js';
import { fixtureFetch, sandboxConfig } from '../helpers/fixture-fetch.js';
import { connectClient } from '../helpers/mcp-client.js';

/** Tool and parameter descriptions say what the code does: the model calls the tools from them. */

interface Listed {
  name: string;
  description?: string;
  inputSchema: { properties?: Record<string, { description?: string }> };
  outputSchema?: unknown;
}

let cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const close of cleanup.reverse()) await close();
  cleanup = [];
});

async function listed(name: string): Promise<Listed> {
  const { client, close } = await connectClient(
    compose(sandboxConfig(), { fetch: fixtureFetch().fetch }),
  );
  cleanup.push(close);
  const tool = (await client.listTools()).tools.find((t) => t.name === name);
  if (tool === undefined) throw new Error(`${name} is not listed`);
  return tool as Listed;
}

const param = (tool: Listed, name: string): string =>
  tool.inputSchema.properties?.[name]?.description ?? '';

describe('tool descriptions match what the tools do', () => {
  it('get_article and get_article_history take a KALIARTI id as well as a LEGIARTI one', async () => {
    for (const name of ['legifrance_get_article', 'legifrance_get_article_history']) {
      const tool = await listed(name);
      expect(param(tool, 'id'), name).toContain('LEGIARTI');
      expect(param(tool, 'id'), name).toContain('KALIARTI');
    }
    expect((await listed('legifrance_get_article')).description).toContain('KALIARTI');
  });

  it('get_article_history says it takes no date and how to read a dated version', async () => {
    const tool = await listed('legifrance_get_article_history');
    expect(tool.description).toContain('It takes no date');
    expect(tool.description).toContain('legifrance_get_article with at_date');
  });

  it('search_legislation: include_historical widens kali too and has no effect on jorf', async () => {
    const d = param(await listed('legifrance_search_legislation'), 'include_historical');
    expect(d).not.toContain('no effect on "jorf" and "kali"');
    expect(d).toContain('"kali"');
    expect(d).toContain('no longer in force');
    expect(d).toContain('No effect on "jorf"');
  });

  it('list_changes: a page holds at most 100 entries, fewer when they are long', async () => {
    const d = param(await listed('legifrance_list_changes'), 'page');
    expect(d).not.toContain('100 entries per page');
    expect(d).toContain('at most 100 entries, fewer when the entries are long');
  });

  it('list_taxonomy: chamber and publication filters take Vigueur names, not the listed keys', async () => {
    const tool = await listed('judilibre_list_taxonomy');
    expect(tool.description).not.toContain(
      'The keys are what the filters of judilibre_search_decisions take.',
    );
    expect(tool.description).toContain(
      'the chamber and publication filters take Vigueur\'s own names instead (e.g. "social", not "soc"; "bulletin", not "b")',
    );
    expect(tool.description).toContain('search_in takes the "field" keys (all but "annexes")');
    expect(JSON.stringify(tool.outputSchema)).not.toContain(
      'The key the filters of judilibre_search_decisions take',
    );
  });
});
