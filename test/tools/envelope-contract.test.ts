import { type Dirent, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
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
import { JUDILIBRE_ROUTES } from '../helpers/judilibre-routes.js';
import { connectClient } from '../helpers/mcp-client.js';

/** Every registered tool answers through the envelope. */
const CONVERTED = new Set<string>([
  'legifrance_get_article',
  'legifrance_get_article_history',
  'legifrance_search_legislation',
  'legifrance_list_changes',
  'legifrance_get_text',
  'legifrance_browse_code',
  'legifrance_latest_jo',
  'legifrance_list_reference_values',
  'legifrance_search_case_law',
  'legifrance_get_decision',
  'judilibre_search_decisions',
  'judilibre_get_decision',
  'judilibre_list_taxonomy',
  'vigueur_status',
]);

interface Case {
  tool: string;
  args: Record<string, unknown>;
  outcome: string;
  /** The fixture routes the call is answered from (default `fixtures`). */
  fetch?: 'fixtures' | 'judilibre' | 'status';
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
  {
    tool: 'legifrance_search_legislation',
    args: { collection: 'codes', code: 'Code civil', article_number: '1240' },
    outcome: 'results',
  },
  {
    tool: 'legifrance_search_legislation',
    args: { collection: 'codes', code: 'Code civil', article_number: '99999' },
    outcome: 'no_results',
  },
  {
    tool: 'legifrance_list_changes',
    args: { code: 'Code civil', since: '2025-01-01', until: '2026-12-31' },
    outcome: 'results',
  },
  {
    tool: 'legifrance_list_changes',
    args: { code: 'Code civil', since: '2025-01-01', until: '2026-12-31', page: 99 },
    outcome: 'no_results',
  },
  { tool: 'legifrance_get_text', args: { nature: 'loi', number: '78-17' }, outcome: 'found' },
  { tool: 'legifrance_get_text', args: { id: 'LEGITEXT999999999999' }, outcome: 'not_found' },
  { tool: 'legifrance_browse_code', args: { code: 'Code du travail' }, outcome: 'results' },
  {
    tool: 'legifrance_browse_code',
    args: { code: 'Code du travail', page: 99 },
    outcome: 'no_results',
  },
  { tool: 'legifrance_latest_jo', args: {}, outcome: 'results' },
  { tool: 'legifrance_latest_jo', args: { page: 99 }, outcome: 'no_results' },
  { tool: 'legifrance_list_reference_values', args: { kind: 'codes' }, outcome: 'results' },
  {
    tool: 'legifrance_search_case_law',
    args: { collection: 'judicial', number: '24-16.924' },
    outcome: 'results',
  },
  {
    tool: 'legifrance_search_case_law',
    args: { collection: 'judicial', number: '24-16.924', page: 99 },
    outcome: 'no_results',
  },
  { tool: 'legifrance_get_decision', args: { id: 'JURITEXT000053197030' }, outcome: 'found' },
  { tool: 'legifrance_get_decision', args: { id: 'JURITEXT000099999999' }, outcome: 'not_found' },
  {
    tool: 'judilibre_search_decisions',
    args: { query: 'forfait jours' },
    outcome: 'results',
    fetch: 'judilibre',
  },
  {
    tool: 'judilibre_search_decisions',
    args: { query: '24-16.924', page: 6 },
    outcome: 'no_results',
    fetch: 'judilibre',
  },
  {
    tool: 'judilibre_get_decision',
    args: { id: '6a0e9ff1cdc6046d47668703' },
    outcome: 'found',
    fetch: 'judilibre',
  },
  {
    tool: 'judilibre_get_decision',
    args: { id: '000000000000000000000000' },
    outcome: 'not_found',
    fetch: 'judilibre',
  },
  {
    tool: 'judilibre_list_taxonomy',
    args: { list: 'chamber' },
    outcome: 'results',
    fetch: 'judilibre',
  },
  {
    tool: 'judilibre_list_taxonomy',
    args: { list: 'chamber', jurisdiction: 'ca' },
    outcome: 'no_results',
    fetch: 'judilibre',
  },
  { tool: 'vigueur_status', args: {}, outcome: 'results', fetch: 'status' },
];

const ROUTES: Record<NonNullable<Case['fetch']>, readonly FixtureRoute[]> = {
  fixtures: LEGIFRANCE_FIXTURE_ROUTES,
  judilibre: JUDILIBRE_ROUTES,
  // The status probes: Légifrance's code list and Judilibre's health check (a body built here, no recorded sample).
  status: [
    ...LEGIFRANCE_FIXTURE_ROUTES,
    { api: 'judilibre', path: '/healthcheck', body: () => ({ status: 'ok' }) },
  ],
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
  it('every registered tool declares an outputSchema and has a case', async () => {
    const client = await connect(compose(sandboxConfig(), { fetch: fixtureFetch().fetch }));
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...CONVERTED].sort());
    expect(CONVERTED.size).toBe(14);
    for (const t of tools) {
      expect(t.outputSchema, t.name).toBeDefined();
      expect(
        CASES.some((c) => c.tool === t.name),
        `${t.name} has a case in CASES`,
      ).toBe(true);
    }
  });

  it('no source file under src/ contains a pictograph', () => {
    const files = (readdirSync('src', { recursive: true, withFileTypes: true }) as Dirent[])
      .filter((e) => e.isFile())
      .map((e) => join(e.parentPath, e.name));
    expect(files.length).toBeGreaterThan(10);
    for (const f of files) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/\p{Extended_Pictographic}/u);
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

  it('vigueur_status (unconfigured) answers not_configured with the setup guide', async () => {
    const client = await connect(compose(loadConfig({})));
    const result = await client.callTool({ name: 'vigueur_status' });
    const a = expectAnswer(result, { source: 'PISTE', outcome: 'not_configured' });
    expect(a.setup_guide).toContain('PISTE_CLIENT_ID');
    expect(a.setup_guide).toContain('Validate my ToS choices');
  });
});
