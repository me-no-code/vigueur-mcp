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
    expect(tools.map((t) => t.name)).toContain('legifrance_get_article');
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
});
