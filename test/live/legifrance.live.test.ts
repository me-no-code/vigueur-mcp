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

  it('gets the outline of loi 78-17', async () => {
    const text = await call('legifrance_get_text', { nature: 'loi', number: '78-17' });
    expect(text).toMatch(/informatique/i);
    expect(text).toContain('section_id');
  }, 30_000);

  it('finds a text by NOR', async () => {
    const text = await call('legifrance_get_text', { nor: 'JUSC1522466R' });
    expect(text).toContain('2016-131');
  }, 30_000);

  it('gets the LOLF as a text outline (LOI_ORGANIQUE nature)', async () => {
    const text = await call('legifrance_get_text', {
      nature: 'loi_organique',
      number: '2001-692',
    });
    expect(text).toContain('2001-692');
    expect(text).toContain('section_id');
    expect(text).not.toMatch(/not found|several texts/i);
  }, 30_000);

  it('says loi 78-17 has no version on 1970-01-01 instead of "not found"', async () => {
    const text = await call('legifrance_get_text', {
      id: 'LEGITEXT000006068624',
      at_date: '1970-01-01',
    });
    expect(text).toContain('no version of this text on 1970-01-01');
    expect(text).not.toContain('on Légifrance. Check it');
  }, 30_000);

  it('reports the decree 2005-1309 as repealed without rendering articles', async () => {
    const text = await call('legifrance_get_text', { nature: 'decret', number: '2005-1309' });
    expect(text).toContain('in force on');
    expect(text).toContain('ceased 2019-06-01');
    expect(text).not.toContain('Article 1');
  }, 30_000);

  it('browses the Code civil root', async () => {
    const text = await call('legifrance_browse_code', { code: 'Code civil' });
    expect(text.match(/section_id/g)?.length ?? 0, text).toBeGreaterThanOrEqual(3);
  }, 30_000);

  it('shows neighbouring articles of Code civil 1240', async () => {
    const text = await call('legifrance_get_article', {
      code: 'Code civil',
      number: '1240',
      include_neighbours: true,
    });
    expect(text).toContain('Previous:');
    expect(text).toContain('Next:');
  }, 30_000);

  it('shows the latest Journal officiel', async () => {
    const text = await call('legifrance_latest_jo', {});
    expect(text).toContain('JORF n°');
    expect(text).toContain('Published');
  }, 30_000);

  it('lists JORF natures', async () => {
    const text = await call('legifrance_list_reference_values', { kind: 'jorf_natures' });
    expect(text).toContain('DECRET');
  }, 30_000);

  it('lists the change log of loi 78-17', async () => {
    const text = await call('legifrance_list_changes', { text: 'loi 78-17', since: '2018-01-01' });
    expect(
      text.split('\n').filter((line) => line.startsWith('- ')).length,
      text,
    ).toBeGreaterThanOrEqual(1);
  }, 30_000);
});
