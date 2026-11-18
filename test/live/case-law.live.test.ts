import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expectAnswer } from '../helpers/answer.js';

// Opt-in (`npm run test:live`): talks to PISTE with the credentials in `.env`.
// Spawns the built entry point, which `npm run test:live` builds first. One call per test (8 in all):
// run them individually with `-t`, never the whole file twice. Assertions read the answer's
// `structuredContent` fields and check stable facts (ids, ECLIs, labels), not full texts,
// because live data evolves.
const ENTRY = fileURLToPath(new URL('../../dist/index.js', import.meta.url));
const ENV_FILE = fileURLToPath(new URL('../../.env', import.meta.url));

describe.skipIf(!process.env.VIGUEUR_LIVE)('Case-law tools against PISTE (live)', () => {
  let client: Client;

  beforeAll(async () => {
    process.loadEnvFile(ENV_FILE);
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) env[key] = value;
    }
    client = new Client({ name: 'live-test', version: '1.0.0' });
    await client.connect(
      new StdioClientTransport({ command: process.execPath, args: [ENTRY], env, stderr: 'pipe' }),
    );
  }, 30_000);

  afterAll(async () => {
    await client?.close();
  });

  /** One tool call; the answer is checked as an envelope answer of `outcome` and returned parsed. */
  async function call(
    source: string,
    name: string,
    args: Record<string, unknown>,
    outcome: string,
  ) {
    const result = await client.callTool({ name, arguments: args });
    return expectAnswer(result, { source, outcome });
  }

  it('judilibre: newest social-chamber decisions on "forfait jours"', async () => {
    const a = await call(
      'Judilibre',
      'judilibre_search_decisions',
      { query: 'forfait jours', match: 'exact_phrase', chamber: 'social', sort: 'newest' },
      'results',
    );
    expect(a.items[0].chamber).toBe('Chambre sociale');
    expect(Number(a.items[0].decided.slice(0, 4))).toBeGreaterThanOrEqual(2026);
    expect(a.items[0].link).toMatch(/^https:\/\/www\.courdecassation\.fr\/decision\//);
  }, 30_000);

  it('judilibre: finds a decision by its case number', async () => {
    const a = await call(
      'Judilibre',
      'judilibre_search_decisions',
      { query: '24-16.924' },
      'results',
    );
    expect(a.items.map((i: { id: string }) => i.id)).toContain('694252ab61c46255e1711cac');
  }, 30_000);

  it('judilibre: reads the motivations zone of a decision', async () => {
    const a = await call(
      'Judilibre',
      'judilibre_get_decision',
      { id: '6af2c6c06c2e1778126fe2c7', zone: 'motivations' },
      'found',
    );
    expect(a.text).toContain('Réponse de la Cour');
    expect(a.ecli).toBe('ECLI:FR:CCASS:2026:SO00939');
    expect(a.link).toContain('courdecassation.fr/decision/');
  }, 30_000);

  it('judilibre: lists the chambers of the Cour de cassation', async () => {
    const a = await call('Judilibre', 'judilibre_list_taxonomy', { list: 'chamber' }, 'results');
    expect(a.items).toContainEqual(
      expect.objectContaining({ key: 'soc', label: 'Chambre sociale' }),
    );
  }, 30_000);

  it('legifrance: finds a Cour de cassation decision by number', async () => {
    const a = await call(
      'Légifrance',
      'legifrance_search_case_law',
      { collection: 'judicial', number: '24-16.924' },
      'results',
    );
    expect(a.items.map((i: { id: string }) => i.id)).toContain('JURITEXT000053197030');
  }, 30_000);

  it('legifrance: reads a Cour de cassation decision', async () => {
    const a = await call(
      'Légifrance',
      'legifrance_get_decision',
      { id: 'JURITEXT000053197030' },
      'found',
    );
    expect(a.ecli).toBe('ECLI:FR:CCASS:2025:SO01200');
    expect(a.link).toContain('/juri/id/JURITEXT000053197030');
  }, 30_000);

  it('legifrance: finds a Conseil constitutionnel decision by number', async () => {
    const a = await call(
      'Légifrance',
      'legifrance_search_case_law',
      { collection: 'constitutional', number: '2026-1217/1218' },
      'results',
    );
    expect(a.items.map((i: { id: string }) => i.id)).toContain('CONSTEXT000054952962');
  }, 30_000);

  it('legifrance: finds a Conseil d’État decision by ECLI', async () => {
    const a = await call(
      'Légifrance',
      'legifrance_search_case_law',
      { collection: 'administrative', ecli: 'ECLI:FR:CEORD:2026:519801.20261006' },
      'results',
    );
    expect(a.items.map((i: { id: string }) => i.id)).toContain('CETATEXT000054960489');
  }, 30_000);
});
