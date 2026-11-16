import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expectAnswer } from '../helpers/answer.js';

// Opt-in (`npm run test:live`): talks to PISTE with the credentials in `.env`.
// Spawns the built entry point: run `npm run build` first. Assertions read the answer's
// `structuredContent` fields and check stable facts, not full texts, because live data evolves.
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

  /** One tool call; the answer is checked as an envelope answer of `outcome` and returned parsed. */
  async function call(name: string, args: Record<string, unknown>, outcome: string) {
    const result = await client.callTool({ name, arguments: args });
    return expectAnswer(result, { source: 'Légifrance', outcome });
  }

  it('reads Code civil art. 1240', async () => {
    const a = await call('legifrance_get_article', { code: 'Code civil', number: '1240' }, 'found');
    expect(a.text).toContain('Tout fait quelconque');
    expect(a.status.state).toBe('in_force');
    expect(a.link).toContain('legifrance.gouv.fr');
  }, 30_000);

  it('reads art. 1382 as of 2015-01-01 and points to 1240', async () => {
    const a = await call(
      'legifrance_get_article',
      { code: 'Code civil', number: '1382', at_date: '2015-01-01' },
      'found',
    );
    expect(a.relocation).toContain('1240');
  }, 30_000);

  it('lists several codes for L1234-1 without a code', async () => {
    const a = await call('legifrance_get_article', { number: 'L1234-1' }, 'several_matches');
    expect(a.candidates.length, JSON.stringify(a.candidates)).toBeGreaterThanOrEqual(2);
    for (const c of a.candidates) expect(c.code).toEqual(expect.any(String));
  }, 30_000);

  it('reports Code du travail R4217-2 as not in force today', async () => {
    const a = await call(
      'legifrance_get_article',
      { code: 'Code du travail', number: 'R4217-2' },
      'not_in_force',
    );
    expect(a.periods.length).toBeGreaterThanOrEqual(1);
  }, 30_000);

  it('lists the Code civil changes of 2025', async () => {
    const a = await call(
      'legifrance_list_changes',
      { code: 'Code civil', since: '2025-01-01', until: '2025-12-31' },
      'results',
    );
    expect(a.results).toBeGreaterThanOrEqual(1);
    expect(a.amending_texts).toBeGreaterThanOrEqual(1);
    expect(a.items.length).toBeGreaterThanOrEqual(1);
  }, 30_000);

  it('searches "préavis" in the Code du travail', async () => {
    const a = await call(
      'legifrance_search_legislation',
      { collection: 'codes', query: 'préavis', code: 'Code du travail' },
      'results',
    );
    expect(a.items.length).toBeGreaterThanOrEqual(1);
  }, 30_000);

  it('gets the outline of loi 78-17', async () => {
    const a = await call('legifrance_get_text', { nature: 'loi', number: '78-17' }, 'found');
    expect(a.title).toMatch(/informatique/i);
    expect(a.part).toBe('outline');
    expect(a.items[0].section_id).toMatch(/^LEGISCTA\d{12}$/);
  }, 30_000);

  it('finds a text by NOR', async () => {
    const a = await call('legifrance_get_text', { nor: 'JUSC1522466R' }, 'found');
    expect(a.title).toContain('2016-131');
  }, 30_000);

  it('gets the LOLF (an organic law) as a text outline', async () => {
    const a = await call(
      'legifrance_get_text',
      { nature: 'loi_organique', number: '2001-692' },
      'found',
    );
    expect(a.title).toContain('2001-692');
    expect(a.items[0].section_id).toMatch(/^LEGISCTA\d{12}$/);
  }, 30_000);

  it('says loi 78-17 has no version on 1970-01-01 instead of "not found"', async () => {
    const a = await call(
      'legifrance_get_text',
      { id: 'LEGITEXT000006068624', at_date: '1970-01-01' },
      'not_in_force',
    );
    expect(a.on).toBe('1970-01-01');
    expect(a.candidates[0].verdict).toBe('no_version');
  }, 30_000);

  it('reports the decree 2005-1309 as repealed without listing articles', async () => {
    const a = await call(
      'legifrance_get_text',
      { nature: 'decret', number: '2005-1309' },
      'not_in_force',
    );
    expect(a.candidates[0].verdict).toBe('ended');
    expect(a.candidates[0].verdict_date).toBe('2019-06-01');
    expect(a).not.toHaveProperty('items');
  }, 30_000);

  it('browses the Code civil root', async () => {
    const a = await call('legifrance_browse_code', { code: 'Code civil' }, 'results');
    expect(
      a.items.filter((i: { type: string }) => i.type === 'section').length,
    ).toBeGreaterThanOrEqual(3);
  }, 30_000);

  // A small code (not the Code du travail or the Code civil, whose tables of contents are huge).
  // Its parts recodified in 2016 are labelled ABROGE today but were in force in 2010: listed,
  // judged by their dates, never hidden or labelled by today's label.
  it("browses the Code de la consommation on 2010-01-01 by its sections' dates", async () => {
    const a = await call(
      'legifrance_browse_code',
      { code: 'Code de la consommation', at_date: '2010-01-01', include_repealed: true },
      'results',
    );
    expect(a.on).toBe('2010-01-01');
    const sections = a.items.filter((i: { type: string }) => i.type === 'section');
    expect(sections.length, JSON.stringify(a.items)).toBeGreaterThan(0);
    expect(
      sections.filter((i: { status: { state: string } }) => i.status.state === 'in_force').length,
    ).toBeGreaterThan(0);
    for (const i of sections) {
      expect(i.section_id).toMatch(/^LEGISCTA\d{12}$/);
      expect(['in_force', 'not_in_force', 'not_yet_in_force', 'never_applied']).toContain(
        i.status.state,
      );
      expect(i.status.on).toBe('2010-01-01');
    }
  }, 30_000);

  it('shows neighbouring articles of Code civil 1240', async () => {
    const a = await call(
      'legifrance_get_article',
      { code: 'Code civil', number: '1240', include_neighbours: true },
      'found',
    );
    // 1240 opens its section: no article precedes it there (and no warning says one could not be read).
    expect(a.neighbours.previous).toBeNull();
    expect(a.neighbours.next.number).toBe('1241');
    expect(a.warnings).toEqual([]);
  }, 30_000);

  it('shows the latest Journal officiel', async () => {
    const a = await call('legifrance_latest_jo', {}, 'results');
    expect(a.items[0].title).toContain('JORF n°');
    expect(a.items[0].published).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  }, 30_000);

  it('lists JORF natures', async () => {
    const a = await call('legifrance_list_reference_values', { kind: 'jorf_natures' }, 'results');
    expect(a.items.map((i: { value: string }) => i.value)).toContain('DECRET');
  }, 30_000);

  it('lists the change log of loi 78-17', async () => {
    const a = await call(
      'legifrance_list_changes',
      { text: 'loi 78-17', since: '2018-01-01' },
      'results',
    );
    expect(a.items.length).toBeGreaterThanOrEqual(1);
  }, 30_000);
});
