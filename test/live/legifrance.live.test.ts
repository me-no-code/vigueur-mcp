import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Opt-in (`npm run test:live`): talks to PISTE with the credentials in `.env`.
// Spawns the built entry point: run `npm run build` first. Assertions check stable
// facts, not full texts, because live data evolves.
const ENTRY = fileURLToPath(new URL('../../dist/index.js', import.meta.url));
const ENV_FILE = fileURLToPath(new URL('../../.env', import.meta.url));

describe.skipIf(!process.env.VIGUEUR_LIVE)('Légifrance tools against PISTE (live)', () => {
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

  it('reads Code civil art. 1240', async () => {
    const text = await call('legifrance_get_article', { code: 'Code civil', number: '1240' });
    expect(text).toContain('Tout fait quelconque');
  }, 30_000);

  it('reads art. 1382 as of 2015-01-01 and points to 1240', async () => {
    const text = await call('legifrance_get_article', {
      code: 'Code civil',
      number: '1382',
      at_date: '2015-01-01',
    });
    expect(text).toContain('1240');
  }, 30_000);

  it('lists several codes for L1234-1 without a code', async () => {
    const text = await call('legifrance_get_article', { number: 'L1234-1' });
    expect(text).toContain('exists in several codes');
    const codeLines = text.split('\n').filter((line) => /^- Code .+\(/.test(line));
    expect(codeLines.length, text).toBeGreaterThanOrEqual(2);
  }, 30_000);

  it('reports Code du travail R4217-2 as not in force today', async () => {
    const text = await call('legifrance_get_article', {
      code: 'Code du travail',
      number: 'R4217-2',
    });
    expect(text).toContain('not in force');
  }, 30_000);

  it('lists the Code civil changes of 2025', async () => {
    const text = await call('legifrance_list_changes', {
      code: 'Code civil',
      since: '2025-01-01',
      until: '2025-12-31',
    });
    expect(text).not.toContain('No change recorded');
    expect(text).toMatch(/\d+ entries in \d+ amending texts?/);
  }, 30_000);

  it('searches "préavis" in the Code du travail', async () => {
    const text = await call('legifrance_search_legislation', {
      collection: 'codes',
      query: 'préavis',
      code: 'Code du travail',
    });
    expect(
      text.split('\n').filter((line) => line.startsWith('- ')).length,
      text,
    ).toBeGreaterThanOrEqual(1);
  }, 30_000);
});
