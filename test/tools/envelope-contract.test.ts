import { afterEach, describe, expect, it } from 'vitest';
import { compose } from '../../src/compose.js';
import { loadConfig } from '../../src/config.js';
import type { ServerDeps } from '../../src/server.js';
import { deniedFetch, expectAnswer, expectToolError } from '../helpers/answer.js';
import {
  type FixtureRoute,
  fixtureFetch,
  LEGIFRANCE_FIXTURE_ROUTES,
  sandboxConfig,
} from '../helpers/fixture-fetch.js';
import { connectClient, firstText } from '../helpers/mcp-client.js';

/** Tools answering through the envelope. */
const CONVERTED = new Set<string>(['legifrance_get_article', 'legifrance_get_article_history']);

interface Case {
  tool: string;
  args: Record<string, unknown>;
  outcome: string;
  /** The fixture routes the call is answered from (default `fixtures`). */
  fetch?: 'fixtures' | 'judilibre';
}

/** Per tool: one success case and one miss case (not_found / no_results / several_matches) where the tool has one.
 * The denied (HTTP 403) case is generated for every converted tool below. */
const CASES: Case[] = [
  {
    tool: 'legifrance_get_article',
    args: { code: 'Code civil', number: '1240' },
    outcome: 'found',
  },
  { tool: 'legifrance_get_article', args: { number: 'L1234-1' }, outcome: 'several_matches' },
  {
    tool: 'legifrance_get_article_history',
    args: { code: 'Code civil', number: '1382' },
    outcome: 'found',
  },
  {
    tool: 'legifrance_get_article_history',
    args: { number: 'L1234-1' },
    outcome: 'several_matches',
  },
];

const ROUTES: Record<NonNullable<Case['fetch']>, readonly FixtureRoute[]> = {
  fixtures: LEGIFRANCE_FIXTURE_ROUTES,
  judilibre: [],
};

/** The `source` a tool's answers name. */
function sourceOf(tool: string): string {
  if (tool.startsWith('legifrance_')) return 'Légifrance';
  if (tool.startsWith('judilibre_')) return 'Judilibre';
  return 'PISTE';
}

let cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const close of cleanup.reverse()) await close();
  cleanup = [];
});

async function connect(deps: ServerDeps) {
  const { client, close } = await connectClient(deps);
  cleanup.push(close);
  return client;
}

describe('envelope contract', () => {
  it('converted tools declare an outputSchema; the others none', async () => {
    const client = await connect(compose(sandboxConfig(), { fetch: fixtureFetch().fetch }));
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(expect.arrayContaining([...CONVERTED]));
    for (const t of tools) {
      if (CONVERTED.has(t.name)) expect(t.outputSchema, t.name).toBeDefined();
      else expect(t.outputSchema, t.name).toBeUndefined();
    }
  });

  it('every case answers through the envelope', async () => {
    for (const c of CASES) {
      const fixtures = fixtureFetch(ROUTES[c.fetch ?? 'fixtures']);
      const client = await connect(compose(sandboxConfig(), { fetch: fixtures.fetch }));
      const result = await client.callTool({ name: c.tool, arguments: c.args });
      expectAnswer(result, { source: sourceOf(c.tool), outcome: c.outcome });
      expect(fixtures.unmatched, `${c.tool}: requests without a fixture`).toEqual([]);
    }
  });

  it('every converted tool fails as JSON when the source refuses (HTTP 403)', async () => {
    // vigueur_status is left out: its probes report a refused source as a check, not an error (test/tools/status.test.ts covers its error path).
    for (const name of [...CONVERTED].filter((n) => n !== 'vigueur_status')) {
      const c = CASES.find((x) => x.tool === name);
      expect(c, `${name} has a case in CASES`).toBeDefined();
      const client = await connect(compose(sandboxConfig(), { fetch: deniedFetch() }));
      const result = await client.callTool({ name, arguments: c?.args ?? {} });
      const e = expectToolError(result, 'forbidden');
      expect(e.request.tool).toBe(name);
      expect(e.retrieved).toMatch(/Z$/);
    }
  });

  it('vigueur_status (unconfigured) returns the setup guide as text, no structuredContent', async () => {
    const client = await connect(compose(loadConfig({})));
    const result = await client.callTool({ name: 'vigueur_status' });
    expect(result.structuredContent).toBeUndefined();
    const text = firstText(result);
    expect(text).toContain('PISTE_CLIENT_ID');
    expect(text).toContain('Validate my ToS choices');
  });
});
