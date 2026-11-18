import { afterEach, describe, expect, it } from 'vitest';
import { compose } from '../../../src/compose.js';
import {
  createGetLegifranceDecision,
  createSearchCaseLaw,
  LEGIFRANCE_CASE_LAW_COVERAGE_NOTE,
} from '../../../src/services/case-law/legifrance.js';
import type {
  CallContext,
  CaseLawHit,
  CaseLawRepository,
  LegifranceDecision,
} from '../../../src/services/case-law/ports.js';
import { MAX_TOOL_TEXT } from '../../../src/tools/format.js';
import { buildGetDecisionAnswer } from '../../../src/tools/legifrance/get-decision.js';
import { createLegifranceSource } from '../../../src/tools/legifrance/index.js';
import { expectAnswer, expectToolError } from '../../helpers/answer.js';
import { fakeLegifrance } from '../../helpers/fake-case-law.js';
import {
  CASE_LAW_FIXTURE_ROUTES,
  fixtureFetch,
  sandboxConfig,
} from '../../helpers/fixture-fetch.js';
import { connectClient } from '../../helpers/mcp-client.js';

const SOURCE = 'Légifrance';
const SEARCH = 'legifrance_search_case_law';
const DECISION = 'legifrance_get_decision';
const LINK = 'https://www.legifrance.gouv.fr/';

let cleanup: Array<() => Promise<void>> = [];
let unmatchedRoutes: string[][] = [];

afterEach(async () => {
  for (const close of cleanup.reverse()) await close();
  cleanup = [];
  const pending = unmatchedRoutes;
  unmatchedRoutes = [];
  for (const unmatched of pending) expect(unmatched, 'requests without a fixture').toEqual([]);
});

async function call(name: string, args: Record<string, unknown>) {
  const fixtures = fixtureFetch([...CASE_LAW_FIXTURE_ROUTES]);
  unmatchedRoutes.push(fixtures.unmatched);
  const { client, close } = await connectClient(
    compose(sandboxConfig(), { fetch: fixtures.fetch, today: () => '2026-11-13' }),
  );
  cleanup.push(close);
  return client.callTool({ name, arguments: args });
}

// First in this file: Node 26.5 (V8 Maglev) answered a whole text with `next` at its end only
// while `sliceForJson` had been compiled on short texts and not yet on long ones.
describe('a long decision that fits one page, read after short ones', () => {
  it('has no part and no next, on every call', async () => {
    const short = decisionFixture();
    const long = decisionFixture({
      id: 'CETATEXT000054960489',
      collection: 'administrative',
      text: 'abcdefghij '.repeat(2_800),
    });
    const { client, close } = await legifranceOver(
      fakeLegifrance({ decisions: { [short.id]: short, [long.id]: long } }).repo,
    );
    cleanup.push(close);
    const found = { source: SOURCE, outcome: 'found' };
    for (let i = 0; i < 10; i++) {
      expectAnswer(await client.callTool({ name: DECISION, arguments: { id: short.id } }), found);
    }
    for (let i = 0; i < 6; i++) {
      const a = expectAnswer(
        await client.callTool({ name: DECISION, arguments: { id: long.id } }),
        found,
      );
      expect(a.part, `call ${i + 1}`).toBeNull();
      expect(a.next, `call ${i + 1}`).toBeNull();
      expect(a.text).toBe(long.text);
    }
  });
});

describe('legifrance_search_case_law', () => {
  it('finds a judicial decision by number, with its link, its full-text pointer and the coverage note', async () => {
    const a = expectAnswer(await call(SEARCH, { collection: 'judicial', number: '24-16.924' }), {
      source: SOURCE,
      outcome: 'results',
    });
    expect(a.collection).toBe('judicial');
    expect(a.results).toBe(1);
    expect(a.page).toEqual({ number: 1, of: 1 });
    expect(a.order).toBe('most_relevant_first');
    expect(a.next).toBeNull();
    const hit = a.items[0];
    expect(hit.id).toBe('JURITEXT000053197030');
    expect(hit.link).toBe(`${LINK}juri/id/JURITEXT000053197030`);
    expect(hit.read_with).toEqual({ tool: DECISION, id: 'JURITEXT000053197030' });
    expect(hit.numbers).toContain('24-16.924');
    expect(hit).not.toHaveProperty('ecli');
    expect(a.warnings).toContain(LEGIFRANCE_CASE_LAW_COVERAGE_NOTE);
    expect(a.request).toMatchObject({
      tool: SEARCH,
      collection: 'judicial',
      page: 1,
      page_size: 10,
      sort: 'relevance',
    });
  });

  it('gives every hit a link and a pointer to its full text, on every collection', async () => {
    for (const collection of ['judicial', 'administrative', 'cnil', 'financial']) {
      const a = expectAnswer(await call(SEARCH, { collection, page_size: 20, sort: 'newest' }), {
        source: SOURCE,
        outcome: 'results',
      });
      expect(a.items.length, collection).toBeGreaterThan(0);
      expect(a.order).toBe('newest_first');
      for (const hit of a.items) {
        expect(hit.link, collection).toContain(LINK);
        expect(hit.link).toContain(hit.id);
        expect(hit.read_with).toEqual({ tool: DECISION, id: hit.id });
        expect(hit).not.toHaveProperty('ecli');
      }
    }
  });

  it('shows the act kind, the decision date and the title of the newest CNIL deliberation', async () => {
    const a = expectAnswer(await call(SEARCH, { collection: 'cnil', sort: 'newest' }), {
      source: SOURCE,
      outcome: 'results',
    });
    const first = a.items[0];
    expect(first.nature).toBe('Délibération');
    expect(first.title).toContain('Délibération');
    expect(first.decided).toBe('2026-11-05');
    expect(a.warnings).not.toContain(LEGIFRANCE_CASE_LAW_COVERAGE_NOTE);
    expect(a.results).toBeGreaterThan(10);
    expect(a.page.of).toBeGreaterThan(1);
    expect(a.next).toEqual({ page: 2 });
  });

  it('explains joined constitutional numbers when a number without "/" finds nothing', async () => {
    const a = expectAnswer(
      await call(SEARCH, { collection: 'constitutional', number: '2026-1217' }),
      { source: SOURCE, outcome: 'no_results' },
    );
    expect(a.results).toBe(0);
    expect(a.items).toEqual([]);
    expect(a.page).toEqual({ number: 1, of: 1 });
    expect(a.warnings.join('\n')).toContain(
      'No Conseil constitutionnel (CONSTIT) decision on Légifrance matches',
    );
    expect(a.warnings.join('\n')).toContain('combined number');
  });

  it('never invents an "unpublished" publication: it is the source\'s wording or null', async () => {
    const a = expectAnswer(await call(SEARCH, { collection: 'administrative', sort: 'newest' }), {
      source: SOURCE,
      outcome: 'results',
    });
    const publications: Array<string | null> = a.items.map(
      (h: { publication: string | null }) => h.publication,
    );
    expect(publications).not.toContain('unpublished');
    expect(publications.some((p) => p === null || /inédit|publié/i.test(p))).toBe(true);
  });

  it('a page past the last page is no_results, with the same fields', async () => {
    const a = expectAnswer(
      await call(SEARCH, { collection: 'judicial', number: '24-16.924', page: 99 }),
      {
        source: SOURCE,
        outcome: 'no_results',
      },
    );
    expect(a.results).toBe(1);
    expect(a.items).toEqual([]);
    expect(a.page).toEqual({ number: 99, of: 1 });
    expect(a.next).toBeNull();
    expect(a.request.page).toBe(99);
  });

  it('rejects the sort "oldest"', async () => {
    const result = await call(SEARCH, { collection: 'cnil', sort: 'oldest' });
    expect(result.isError).toBe(true);
  });
});

describe('legifrance_get_decision', () => {
  const ids = [
    'JURITEXT000053197030',
    'CETATEXT000054960489',
    'CONSTEXT000054952962',
    'JUFITEXT000055005642',
    'CNILTEXT000053716494',
  ];

  it.each(ids)('%s: carries its identity, its link and its text', async (id) => {
    const a = expectAnswer(await call(DECISION, { id }), { source: SOURCE, outcome: 'found' });
    expect(a.id).toBe(id);
    expect(a.link).toContain(LINK);
    expect(a.link).toContain(id);
    expect(a.title).not.toBe('');
    expect(a.decided).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(a.numbers.length).toBeGreaterThan(0);
    expect(a.text.length).toBeGreaterThan(0);
    expect(a.request).toEqual({ tool: DECISION, id, offset: 0 });
  });

  it('the Conseil constitutionnel decision gives its official pages', async () => {
    const a = expectAnswer(await call(DECISION, { id: 'CONSTEXT000054952962' }), {
      source: SOURCE,
      outcome: 'found',
    });
    expect(a.constitutional_council_link).toBe(
      'https://www.conseil-constitutionnel.fr/decision/2026/20261217_1218QPC.htm',
    );
    expect(a.jo_link).toEqual(expect.any(String));
  });

  it('the CNIL deliberation gives its status as Légifrance labels it, and its publication date', async () => {
    const a = expectAnswer(await call(DECISION, { id: 'CNILTEXT000053716494' }), {
      source: SOURCE,
      outcome: 'found',
    });
    expect(a.legifrance_status).toEqual(expect.any(String));
    expect(a.published).toBe('2026-03-26');
    expect(a.title).toMatch(/^Délibération /);
  });

  it('a Cour de cassation decision gives its attacked decision and the Judilibre pointer', async () => {
    const a = expectAnswer(await call(DECISION, { id: 'JURITEXT000053197030' }), {
      source: SOURCE,
      outcome: 'found',
    });
    expect(a.attacked).toEqual({ court: "Cour d'appel de Bordeaux", decided: '2024-05-29' });
    expect(a.ecli).toBe('ECLI:FR:CCASS:2025:SO01200');
    expect(a.other_source).toEqual({
      tool: 'judilibre_search_decisions',
      query: 'ECLI:FR:CCASS:2025:SO01200',
    });
    expect(a.warnings).toContain("other_source searches Judilibre for this decision's ECLI.");
    expect(a.part).toBeNull();
    expect(a.next).toBeNull();
  });

  it('answers not_found for an unknown id, with the coverage note for a JURITEXT id', async () => {
    const a = expectAnswer(await call(DECISION, { id: 'JURITEXT000099999999' }), {
      source: SOURCE,
      outcome: 'not_found',
    });
    expect(a.id).toBe('JURITEXT000099999999');
    expect(a.warnings).toContain('No Légifrance decision with id "JURITEXT000099999999".');
    expect(a.warnings).toContain('Find decisions with legifrance_search_case_law.');
    expect(a.warnings).toContain(LEGIFRANCE_CASE_LAW_COVERAGE_NOTE);
  });

  it('rejects an offset past the end of the text', async () => {
    const result = await call(DECISION, { id: 'JURITEXT000053197030', offset: 10_000_000 });
    const e = expectToolError(result, 'invalid_input');
    expect(e.error.message).toContain('offset');
    expect(e.request).toEqual({ tool: DECISION, id: 'JURITEXT000053197030', offset: 10_000_000 });
  });

  it('rejects an offset at the end of the text, like legifrance_get_article; offset 0 reads an empty text', async () => {
    const d = decisionFixture({ text: 'texte' });
    const repo = fakeLegifrance({ decisions: { [d.id]: d } }).repo;
    const e = expectToolError(
      await callOver(repo, DECISION, { id: d.id, offset: 5 }),
      'invalid_input',
    );
    expect(e.error.message).toBe('"offset" 5 is past the end of the text (5 characters).');
    expect(e.request).toEqual({ tool: DECISION, id: d.id, offset: 5 });
    const empty = decisionFixture({ text: '' });
    const a = expectAnswer(
      await callOver(fakeLegifrance({ decisions: { [empty.id]: empty } }).repo, DECISION, {
        id: empty.id,
        offset: 0,
      }),
      { source: SOURCE, outcome: 'found' },
    );
    expect(a.text).toBe('');
    expect(a.part).toBeNull();
    expect(a.next).toBeNull();
  });
});

function decisionFixture(over: Partial<LegifranceDecision> = {}): LegifranceDecision {
  return {
    id: 'CNILTEXT000053716494',
    collection: 'cnil',
    title: 'Délibération n° 2026-001 du 2 janvier 2026',
    court: 'Commission nationale de l’informatique et des libertés',
    chamber: null,
    nature: 'Délibération',
    decisionDate: '2026-01-02',
    numbers: ['2026-001'],
    ecli: null,
    solution: null,
    publication: null,
    summary: null,
    attacked: null,
    text: 'texte',
    constitutionalCouncilUrl: null,
    joUrl: null,
    labelledStatus: null,
    publishedOn: null,
    ...over,
  };
}

function legifranceOver(repo: CaseLawRepository) {
  const unused = () => Promise.reject(new Error('not used'));
  return connectClient({
    config: sandboxConfig(),
    getStatus: unused,
    sources: [
      createLegifranceSource({
        getArticle: unused,
        getArticleHistory: unused,
        searchLegislation: unused,
        listChanges: unused,
        getText: unused,
        browseCode: unused,
        latestJo: unused,
        listReferenceValues: unused,
        searchCaseLaw: createSearchCaseLaw(repo),
        getDecision: createGetLegifranceDecision(repo),
      }),
    ],
  });
}

async function callOver(repo: CaseLawRepository, name: string, args: Record<string, unknown>) {
  const { client, close } = await legifranceOver(repo);
  cleanup.push(close);
  return client.callTool({ name, arguments: args });
}

/** Reads a decision page by page; returns the answers in order. */
async function readAll(repo: CaseLawRepository, id: string) {
  const pages: ReturnType<typeof expectAnswer>[] = [];
  let offset = 0;
  for (;;) {
    const a = expectAnswer(await callOver(repo, DECISION, { id, offset }), {
      source: SOURCE,
      outcome: 'found',
    });
    pages.push(a);
    if (a.next === null) return pages;
    expect(a.next).toEqual({ offset: a.part.to });
    offset = a.next.offset;
    expect(pages.length).toBeLessThan(30);
  }
}

describe('a long decision', () => {
  const long = decisionFixture({
    id: 'CETATEXT000054960489',
    collection: 'administrative',
    title: 'Conseil d’État, 2026',
    court: "Conseil d'État",
    nature: 'Décision',
    numbers: ['400000'],
    summary: 'Sommaire de la décision.',
    text: 'abcdefghij '.repeat(9_091),
  });

  it('is paged under 40 000 characters; each page carries the identity, the first the summary', async () => {
    const pages = await readAll(fakeLegifrance({ decisions: { [long.id]: long } }).repo, long.id);
    expect(pages.length).toBeGreaterThanOrEqual(3);
    expect(pages.map((p) => p.text).join('')).toBe(long.text);
    for (const [i, p] of pages.entries()) {
      expect(JSON.stringify(p).length).toBeLessThanOrEqual(MAX_TOOL_TEXT);
      expect(p.link).toContain('/ceta/id/');
      expect(p.court).toBe("Conseil d'État");
      expect(p.decided).toBe('2026-01-02');
      expect(p.numbers).toEqual(['400000']);
      expect(p.summary).toBe(i === 0 ? 'Sommaire de la décision.' : null);
      expect(p.part).toEqual({
        from: i === 0 ? 0 : pages[i - 1]?.part.to,
        to: p.next === null ? long.text.length : p.next.offset,
        of: long.text.length,
      });
    }
  });

  it('reads text dense with quotes, backslashes and line breaks without losing or repeating a character', async () => {
    const dense = decisionFixture({ text: '"a\\b"\n'.repeat(12_000) });
    const pages = await readAll(
      fakeLegifrance({ decisions: { [dense.id]: dense } }).repo,
      dense.id,
    );
    expect(pages.length).toBeGreaterThan(2);
    expect(pages.map((p) => p.text).join('')).toBe(dense.text);
  });

  it('a judicial last page with the pointer stays under the size limit, escapes included', async () => {
    const judicial = decisionFixture({
      id: 'JURITEXT000053197030',
      collection: 'judicial',
      ecli: 'ECLI:FR:CCASS:2025:SO01200',
      text: '"\\\n'.repeat(30_000),
    });
    const pages = await readAll(
      fakeLegifrance({ decisions: { [judicial.id]: judicial } }).repo,
      judicial.id,
    );
    const last = pages.at(-1);
    expect(last?.other_source).not.toBeNull();
    for (const p of pages) expect(JSON.stringify(p).length).toBeLessThanOrEqual(MAX_TOOL_TEXT);
    expect(pages.map((p) => p.text).join('')).toBe(judicial.text);
  });

  it('puts the Judilibre pointer on the last page only', async () => {
    const judicial = decisionFixture({
      id: 'JURITEXT000053197030',
      collection: 'judicial',
      ecli: 'ECLI:FR:CCASS:2025:SO01200',
      text: 'abcdefghij '.repeat(9_091),
    });
    const pages = await readAll(
      fakeLegifrance({ decisions: { [judicial.id]: judicial } }).repo,
      judicial.id,
    );
    for (const [i, p] of pages.entries()) {
      const last = i === pages.length - 1;
      expect(p.other_source !== null, `page ${i + 1}`).toBe(last);
      expect(p.warnings.length > 0, `page ${i + 1}`).toBe(last);
    }
  });

  it('a very long summary is cut so the text still has room', async () => {
    const big = decisionFixture({ summary: 'S'.repeat(50_000), text: 'texte '.repeat(10_000) });
    const a = expectAnswer(
      await callOver(fakeLegifrance({ decisions: { [big.id]: big } }).repo, DECISION, {
        id: big.id,
      }),
      { source: SOURCE, outcome: 'found' },
    );
    expect(a.summary.length).toBeLessThanOrEqual(2_000);
    expect(a.text).toContain('texte texte');
    expect(a.next.offset).toBeGreaterThanOrEqual(2_000);
    expect(JSON.stringify(a).length).toBeLessThanOrEqual(MAX_TOOL_TEXT);
  });
});

const hitOf = (over: Partial<CaseLawHit> = {}): CaseLawHit => ({
  id: 'JURITEXT000053197030',
  collection: 'judicial',
  title: 'Cour de cassation, 2026, 24-16.924',
  court: 'Cour de cassation',
  chamber: null,
  nature: null,
  decisionDate: '2026-01-02',
  numbers: ['24-16.924'],
  publication: null,
  solution: null,
  snippet: null,
  ...over,
});

describe('search hits and echoed criteria', () => {
  it('a hit whose title did not parse keeps the raw title, with no court and no numbers', async () => {
    const raw = 'Un titre que la grammaire ne reconnaît pas, 2 janvier 2026';
    const repo = fakeLegifrance({
      hits: [hitOf({ title: raw, court: null, numbers: [], decisionDate: '2026-01-02' })],
    }).repo;
    const a = expectAnswer(await callOver(repo, SEARCH, { collection: 'judicial' }), {
      source: SOURCE,
      outcome: 'results',
    });
    expect(a.items[0]).toMatchObject({
      title: raw,
      court: null,
      numbers: [],
      decided: '2026-01-02',
    });
  });

  it('carries the court, chamber, publication, solution and the excerpt as the client gives it', async () => {
    const repo = fakeLegifrance({
      hits: [
        hitOf({
          chamber: 'Chambre sociale',
          publication: 'Publié au bulletin',
          solution: 'Rejet',
          snippet: `${'x'.repeat(299)}…`,
        }),
      ],
    }).repo;
    const a = expectAnswer(await callOver(repo, SEARCH, { collection: 'judicial' }), {
      source: SOURCE,
      outcome: 'results',
    });
    const hit = a.items[0];
    expect(hit).toMatchObject({
      court: 'Cour de cassation',
      chamber: 'Chambre sociale',
      publication: 'Publié au bulletin',
      solution: 'Rejet',
    });
    expect(hit.excerpt).toBe(`${'x'.repeat(299)}…`);
  });

  it('the request echoes the number as given; the normalised one shows in the hit and in the zero-result sentence', async () => {
    const found = expectAnswer(
      await callOver(fakeLegifrance({ hits: [hitOf()] }).repo, SEARCH, {
        collection: 'judicial',
        number: '2416924',
      }),
      { source: SOURCE, outcome: 'results' },
    );
    expect(found.request.number).toBe('2416924');
    expect(found.items[0].numbers).toContain('24-16.924');
    const none = expectAnswer(
      await callOver(fakeLegifrance({ hits: [] }).repo, SEARCH, {
        collection: 'judicial',
        number: '2416924',
      }),
      { source: SOURCE, outcome: 'no_results' },
    );
    expect(none.request.number).toBe('2416924');
    expect(none.warnings.join('\n')).toContain('n° 24-16.924');
  });

  it('the zero-result sentence reads the chamber with the Légifrance label, not the Judilibre one', async () => {
    const a = expectAnswer(
      await callOver(fakeLegifrance({ hits: [] }).repo, SEARCH, {
        collection: 'judicial',
        chamber: 'commercial',
      }),
      { source: SOURCE, outcome: 'no_results' },
    );
    expect(a.warnings.join('\n')).toContain('Chambre commerciale, financière et économique');
    expect(a.warnings).toContain(LEGIFRANCE_CASE_LAW_COVERAGE_NOTE);
  });

  it('a CNIL deliberation of the formation restreinte keeps its act kind', async () => {
    const a = expectAnswer(
      await call(SEARCH, { collection: 'cnil', sort: 'newest', page_size: 20 }),
      {
        source: SOURCE,
        outcome: 'results',
      },
    );
    const hit = a.items.find((h: { title: string }) => h.title.includes('SAN-2026-015'));
    expect(hit.nature).toBe('Délibération');
  });

  it('a single decision is a count of 1', async () => {
    const a = expectAnswer(
      await callOver(fakeLegifrance({ hits: [hitOf()] }).repo, SEARCH, {
        collection: 'judicial',
        query: 'x',
      }),
      { source: SOURCE, outcome: 'results' },
    );
    expect(a.results).toBe(1);
    expect(a.items).toHaveLength(1);
  });

  it('leaves out the hits that do not fit under the size limit, and says so', async () => {
    const numbers = Array.from({ length: 600 }, (_, i) => `24-${String(i).padStart(5, '0')}`);
    const hits = Array.from({ length: 20 }, (_, i) =>
      hitOf({ id: `JURITEXT0000531970${String(i).padStart(2, '0')}`, numbers }),
    );
    const a = expectAnswer(
      await callOver(fakeLegifrance({ hits }).repo, SEARCH, {
        collection: 'judicial',
        page_size: 20,
      }),
      { source: SOURCE, outcome: 'results' },
    );
    expect(a.items.length).toBeGreaterThan(0);
    expect(a.items.length).toBeLessThan(20);
    expect(a.warnings).toContain(
      `(Only the first ${a.items.length} of 20 hits of this page fit — use a smaller "page_size".)`,
    );
  });
});

describe('get_decision answer builder', () => {
  it('gives the publication date of a decision that is not a CNIL deliberation', () => {
    const answer = buildGetDecisionAnswer(
      {
        kind: 'found',
        decision: decisionFixture({
          id: 'CETATEXT000054960489',
          collection: 'administrative',
          publishedOn: '2026-02-03',
        }),
      },
      { request: { tool: DECISION, id: 'CETATEXT000054960489', offset: 0 }, offset: 0 },
    );
    expect(answer).toMatchObject({ outcome: 'found', published: '2026-02-03' });
  });

  it('cuts the title at 300 characters', () => {
    const answer = buildGetDecisionAnswer(
      { kind: 'found', decision: decisionFixture({ title: 'T'.repeat(400) }) },
      { request: { tool: DECISION, id: 'CNILTEXT000053716494', offset: 0 }, offset: 0 },
    );
    expect(answer).toMatchObject({ title: `${'T'.repeat(299)}…` });
  });
});

describe('case-law search defaults', () => {
  it('sorts by relevance with a criterion and newest first without', async () => {
    const search = createSearchCaseLaw(fakeLegifrance({ hits: [] }).repo);
    const none = await search({ collection: 'cnil' }, {} as CallContext);
    const some = await search({ collection: 'cnil', query: 'x' }, {} as CallContext);
    expect(none.query.sort).toBe('newest');
    expect(some.query.sort).toBe('relevance');
  });
});
