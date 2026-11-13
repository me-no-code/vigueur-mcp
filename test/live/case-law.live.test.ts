import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Opt-in (`npm run test:live`): talks to PISTE with the credentials in `.env`.
// Spawns the built entry point: run `npm run build` first. One call per test (8 in all):
// run them individually with `-t`, never the whole file twice. Assertions check stable
// facts (ids, ECLIs, labels), not full texts, because live data evolves.
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

  async function call(name: string, args: Record<string, unknown>): Promise<string> {
    const result = await client.callTool({ name, arguments: args });
    const [first] = result.content as Array<{ type: string; text?: string }>;
    const text = first?.text ?? '';
    expect(result.isError, text).toBeFalsy();
    return text;
  }

  it('judilibre: newest social-chamber decisions on "forfait jours"', async () => {
    const text = await call('judilibre_search_decisions', {
      query: 'forfait jours',
      match: 'exact_phrase',
      chamber: 'social',
      sort: 'newest',
    });
    expect(text).toContain('Chambre sociale');
    const year = /decision of (\d{4})/.exec(text)?.[1];
    expect(Number(year)).toBeGreaterThanOrEqual(2026);
    expect(text).toContain('Source: Judilibre · https://www.courdecassation.fr/decision/');
  }, 30_000);

  it('judilibre: finds a decision by its case number', async () => {
    const text = await call('judilibre_search_decisions', { query: '24-16.924' });
    expect(text).toContain('694252ab61c46255e1711cac');
    expect(text).toContain('Source: Judilibre · ');
  }, 30_000);

  it('judilibre: reads the motivations zone of a decision', async () => {
    const text = await call('judilibre_get_decision', {
      id: '6af2c6c06c2e1778126fe2c7',
      zone: 'motivations',
    });
    expect(text).toContain('Réponse de la Cour');
    expect(text).toContain('ECLI:FR:CCASS:2026:SO00939');
    expect(text).toContain('Source: Judilibre · ');
  }, 30_000);

  it('judilibre: lists the chambers of the Cour de cassation', async () => {
    const text = await call('judilibre_list_taxonomy', { list: 'chamber' });
    expect(text).toContain('soc — Chambre sociale');
  }, 30_000);

  it('legifrance: finds a Cour de cassation decision by number', async () => {
    const text = await call('legifrance_search_case_law', {
      collection: 'judicial',
      number: '24-16.924',
    });
    expect(text).toContain('JURITEXT000053197030');
    expect(text).toContain('Source: Légifrance · ');
  }, 30_000);

  it('legifrance: reads a Cour de cassation decision', async () => {
    const text = await call('legifrance_get_decision', { id: 'JURITEXT000053197030' });
    expect(text).toContain('ECLI:FR:CCASS:2025:SO01200');
    expect(text).toContain('/juri/id/JURITEXT000053197030');
    expect(text).toContain('Source: Légifrance · ');
  }, 30_000);

  it('legifrance: finds a Conseil constitutionnel decision by number', async () => {
    const text = await call('legifrance_search_case_law', {
      collection: 'constitutional',
      number: '2026-1217/1218',
    });
    expect(text).toContain('CONSTEXT000054952962');
    expect(text).toContain('Source: Légifrance · ');
  }, 30_000);

  it('legifrance: finds a Conseil d’État decision by ECLI', async () => {
    const text = await call('legifrance_search_case_law', {
      collection: 'administrative',
      ecli: 'ECLI:FR:CEORD:2026:519801.20261006',
    });
    expect(text).toContain('CETATEXT000054960489');
    expect(text).toContain('Source: Légifrance · ');
  }, 30_000);
});
