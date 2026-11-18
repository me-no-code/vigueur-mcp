import { describe, expect, it } from 'vitest';
import { htmlToText } from '../../../src/clients/html.js';
import { compose } from '../../../src/compose.js';
import { loadConfig } from '../../../src/config.js';
import { expectAnswer, expectToolError } from '../../helpers/answer.js';
import { useServers } from '../../helpers/composed-server.js';
import { loadFixture } from '../../helpers/fake-piste-http.js';
import { fixtureFetch, sandboxConfig } from '../../helpers/fixture-fetch.js';
import { link } from '../../helpers/get-article-builders.js';
import { firstText } from '../../helpers/mcp-client.js';

const TOOL = 'legifrance_get_article';
const SOURCE = 'Légifrance';
const FOUND = { source: SOURCE, outcome: 'found' };

type Answer = ReturnType<typeof expectAnswer>;

const { connect, composed, watch } = useServers();

async function call(args: Record<string, unknown>) {
  const client = await composed();
  return client.callTool({ name: TOOL, arguments: args });
}

// First in this file: Node 26.5 (V8 Maglev) answered a whole text with `next` at its end only
// while `sliceForJson` had been compiled on short texts and not yet on long ones.
describe('a long article that fits one page, read after short ones', () => {
  it('CGI art. 199 undecies B (fixture 59, default inputs): no part and no next, on every call', async () => {
    const client = await composed();
    for (let i = 0; i < 10; i++) {
      const short = await client.callTool({
        name: TOOL,
        arguments: { code: 'Code civil', number: '1240' },
      });
      expectAnswer(short, FOUND);
    }
    const recorded = loadFixture('59-getArticleWithIdAndNum-cgi-long') as {
      article: { texteHtml: string };
    };
    const full = htmlToText(recorded.article.texteHtml);
    for (let i = 0; i < 6; i++) {
      const a = expectAnswer(
        await client.callTool({ name: TOOL, arguments: { id: 'LEGIARTI000046892900' } }),
        FOUND,
      );
      expect(a.part, `call ${i + 1}`).toBeNull();
      expect(a.next, `call ${i + 1}`).toBeNull();
      expect(a.text).toBe(full);
    }
  });
});

describe('legifrance_get_article over the composed server (fixtures)', () => {
  it('Code civil 1240 today: official text, in force, link', async () => {
    const a = expectAnswer(await call({ code: 'Code civil', number: '1240' }), FOUND);
    expect(a.code).toBe('Code civil');
    expect(a.number).toBe('1240');
    expect(a.text).toContain('Tout fait quelconque');
    expect(a.status).toEqual({
      state: 'in_force',
      on: a.request.at_date,
      from: '2016-10-01',
      until: null,
      until_undetermined: false,
    });
    expect(a.legifrance_status).toBe('VIGUEUR');
    expect(a.section.join(' › ')).toContain(
      'Livre III : Des différentes manières dont on acquiert la propriété › Titre III : Des sources d',
    );
    expect(a.link).toBe(link('LEGIARTI000032041571'));
    expect(a.id).toBe('LEGIARTI000032041571');
    expect(a.versions).toBeNull();
    expect(a.request).toEqual({
      tool: TOOL,
      code: 'Code civil',
      number: '1240',
      at_date: expect.stringMatching(/^\d{4}-\d\d-\d\d$/),
      response_format: 'concise',
      offset: 0,
      include_neighbours: false,
    });
  });

  it('Code civil 1240 on 2016-10-01, the day its version starts: in force', async () => {
    const a = expectAnswer(
      await call({ code: 'Code civil', number: '1240', at_date: '2016-10-01' }),
      FOUND,
    );
    expect(a.status).toMatchObject({ state: 'in_force', on: '2016-10-01', from: '2016-10-01' });
  });

  it('a blank code is absent from the request (Code civil 1240, code "")', async () => {
    const a = expectAnswer(await call({ code: '', number: '1240' }), FOUND);
    expect(a.id).toBe('LEGIARTI000032041571');
    expect('code' in a.request).toBe(false);
    expect(Object.keys(a.request)).toEqual([
      'tool',
      'number',
      'at_date',
      'response_format',
      'offset',
      'include_neighbours',
    ]);
  });

  it('L1234-1 without a code lists both codes instead of picking one', async () => {
    const a = expectAnswer(await call({ number: 'L1234-1' }), {
      source: SOURCE,
      outcome: 'several_matches',
    });
    expect(a.warnings).toContain(
      'Article L1234-1 exists in several codes — call again with "code".',
    );
    expect(a.number).toBe('L1234-1');
    expect(a.code).toBeNull();
    expect(a.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'Code du travail', from: '2008-05-01' }),
        expect.objectContaining({ code: 'Code de la santé publique', from: '2004-08-07' }),
      ]),
    );
    for (const c of a.candidates) {
      expect(c.read_with).toEqual({ tool: TOOL, id: c.id });
    }
  });

  it('Code civil 1382 on 2015-01-01: old text, and where its content moved', async () => {
    const a = expectAnswer(
      await call({ code: 'Code civil', number: '1382', at_date: '2015-01-01' }),
      FOUND,
    );
    expect(a.text).toContain('Tout fait quelconque');
    expect(a.status).toEqual({
      state: 'in_force',
      on: '2015-01-01',
      from: '1804-03-21',
      until: '2016-10-01',
      until_undetermined: false,
    });
    expect(a.legifrance_status).toBe('MODIFIE');
    expect(a.relocation).toContain(
      'Content moved — per Légifrance concordance, the text of art. 1382 as of 2015-01-01 is now at Code civil - art. 1240 (V)',
    );
  });

  it('a repealed article is reported with its periods, not as not found', async () => {
    const a = expectAnswer(await call({ code: 'Code du travail', number: 'R4217-2' }), {
      source: SOURCE,
      outcome: 'not_in_force',
    });
    expect(a.warnings[0]).toMatch(
      /^Art\. R4217-2 of Code du travail exists but was not in force on \d{4}-\d\d-\d\d\.$/,
    );
    expect(a.number).toBe('R4217-2');
    expect(a.code).toBe('Code du travail');
    expect(a.periods).toContainEqual({
      id: 'LEGIARTI000018532352',
      code: 'Code du travail',
      legifrance_status: 'ABROGE',
      from: '2008-05-01',
      until: '2026-10-01',
      until_undetermined: false,
      link: link('LEGIARTI000018532352'),
    });
  });

  it('detailed adds the versions, modifications and citation count', async () => {
    const a = expectAnswer(
      await call({
        code: 'Code civil',
        number: '1382',
        at_date: '2015-01-01',
        response_format: 'detailed',
      }),
      FOUND,
    );
    expect(a.versions).toContainEqual(
      expect.objectContaining({
        version: '1.0',
        shown: true,
        legifrance_status: 'MODIFIE',
        from: '1804-03-21',
        until: '2016-10-01',
      }),
    );
    expect(a.versions).toContainEqual(
      expect.objectContaining({
        version: '2.0',
        shown: false,
        legifrance_status: 'VIGUEUR',
        from: '2016-10-01',
        until: null,
        until_undetermined: false,
      }),
    );
    expect(a.modifications).toContainEqual(
      expect.objectContaining({
        action: 'created',
        by: expect.stringContaining('Loi 1804-02-09 promulguée le 19 février 1804'),
      }),
    );
    expect(a.cited_by).toBe(65);
  });

  it('1240: detailed gives versions, modifications and cited_by; concise gives null for all three', async () => {
    const detailed = expectAnswer(
      await call({ code: 'Code civil', number: '1240', response_format: 'detailed' }),
      FOUND,
    );
    expect(Array.isArray(detailed.versions)).toBe(true);
    expect(detailed.versions.length).toBeGreaterThan(0);
    expect(detailed.versions.filter((v: Answer) => v.shown)).toEqual([
      expect.objectContaining({ id: 'LEGIARTI000032041571' }),
    ]);
    expect(Array.isArray(detailed.modifications)).toBe(true);
    expect(typeof detailed.cited_by).toBe('number');

    const concise = expectAnswer(await call({ code: 'Code civil', number: '1240' }), FOUND);
    expect(concise.versions).toBeNull();
    expect(concise.modifications).toBeNull();
    expect(concise.cited_by).toBeNull();
  });

  it('blank optional inputs count as absent', async () => {
    const a = expectAnswer(await call({ number: 'L1234-1', code: '', at_date: '', id: '' }), {
      source: SOURCE,
      outcome: 'several_matches',
    });
    expect(a.candidates.map((c: Answer) => c.code)).toContain('Code de la santé publique');
    expect(Object.keys(a.request)).toEqual([
      'tool',
      'number',
      'at_date',
      'response_format',
      'offset',
      'include_neighbours',
    ]);
  });

  it('an unknown code is reported as such, without searching any article', async () => {
    const a = expectAnswer(await call({ code: 'C. route', number: 'R413-17' }), {
      source: SOURCE,
      outcome: 'not_found',
    });
    expect(a.reason).toBe('unknown_code');
    expect(a.code).toBe('C. route');
    expect(a.number).toBe('R413-17');
    expect(a.warnings[0]).toContain('Unknown code "C. route": no Légifrance code has this title.');
  });

  it('rejects an impossible date', async () => {
    const result = await call({ at_date: '2015-13-01', number: '1240' });
    expect(result.isError).toBe(true);
    expect(firstText(result)).toContain('YYYY-MM-DD');
  });

  it('rejects a call without number or id', async () => {
    const e = expectToolError(await call({}), 'invalid_input');
    expect(e.error.message).toContain('Give an article number with its code');
    expect(e.request).toEqual({
      tool: TOOL,
      at_date: expect.stringMatching(/^\d{4}-\d\d-\d\d$/),
      response_format: 'concise',
      offset: 0,
      include_neighbours: false,
    });
  });

  it('include_neighbours on Code civil 1240: first of its chapter, then art. 1241 (fixtures 23, 113)', async () => {
    const a = expectAnswer(
      await call({ code: 'Code civil', number: '1240', include_neighbours: true }),
      FOUND,
    );
    expect(a.neighbours).toEqual({
      previous: null,
      // Art. 1241 is 128 characters long: shown whole.
      next: {
        number: '1241',
        id: 'LEGIARTI000032041565',
        excerpt:
          "Chacun est responsable du dommage qu'il a causé non seulement par son fait, mais encore par sa négligence ou par son imprudence.",
        excerpt_cut: false,
        link: link('LEGIARTI000032041565'),
      },
    });
    expect(a.warnings).toEqual([]);
    expect(a.request.include_neighbours).toBe(true);
  });

  it('without include_neighbours, no neighbours are read or shown', async () => {
    const fixtures = fixtureFetch();
    watch(fixtures.unmatched);
    const client = await connect(compose(sandboxConfig(), { fetch: fixtures.fetch }));
    const result = await client.callTool({
      name: TOOL,
      arguments: { code: 'Code civil', number: '1240' },
    });
    expect(expectAnswer(result, FOUND).neighbours).toBeNull();
    expect(fixtures.calls.some((c) => c.url.endsWith('/consult/getSectionByCid'))).toBe(false);
  });

  it('is listed with annotations and an output schema, only when configured', async () => {
    const client = await composed();
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === TOOL);
    expect(tool?.annotations).toEqual({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    });
    expect(tool?.outputSchema?.type).toBe('object');
    expect(tool?.description).toContain('it lists the candidates instead of guessing');

    const unconfigured = await connect(compose(loadConfig({})));
    const names = (await unconfigured.listTools()).tools.map((t) => t.name);
    expect(names).not.toContain(TOOL);
  });
});
