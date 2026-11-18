import { afterEach, describe, expect, it } from 'vitest';
import { compose } from '../../../src/compose.js';
import type { ServerDeps } from '../../../src/server.js';
import {
  createGetJudilibreDecision,
  createListJudilibreTaxonomy,
  createSearchJudilibre,
} from '../../../src/services/case-law/judilibre.js';
import type {
  JudilibreHit,
  JudilibreRepository,
  TaxonomyEntry,
} from '../../../src/services/case-law/ports.js';
import { MAX_TOOL_TEXT } from '../../../src/tools/format.js';
import { createJudilibreSource } from '../../../src/tools/judilibre/index.js';
import { expectAnswer, expectToolError } from '../../helpers/answer.js';
import { decisionOf, fakeJudilibre } from '../../helpers/fake-case-law.js';
import { loadFixture } from '../../helpers/fake-piste-http.js';
import { type FixtureRoute, fixtureFetch, sandboxConfig } from '../../helpers/fixture-fetch.js';
import { JUDILIBRE_ROUTES } from '../../helpers/judilibre-routes.js';
import { connectClient } from '../../helpers/mcp-client.js';

const SOURCE = 'Judilibre';
const SEARCH = 'judilibre_search_decisions';
const DECISION = 'judilibre_get_decision';
const TAXONOMY = 'judilibre_list_taxonomy';
const LINK = 'https://www.courdecassation.fr/decision/';

/** Decision 49's text repeated past 60 000 characters, under an id no recorded fixture has. */
const LONG_ID = 'dddddddddddddddddddddddd';
const decision49 = loadFixture('49-decision-ca-paris', 'judilibre') as { text: string };
const LONG_TEXT = decision49.text.repeat(Math.ceil(60_001 / decision49.text.length));
const ROUTES: FixtureRoute[] = [
  ...JUDILIBRE_ROUTES,
  {
    api: 'judilibre',
    path: '/decision',
    whenQuery: (q) => q.get('id') === LONG_ID,
    // No recorded sample is long enough to span several pages.
    body: () => ({ ...decision49, id: LONG_ID, text: LONG_TEXT, zones: {} }),
  },
];

let cleanup: Array<() => Promise<void>> = [];
let unmatchedRoutes: string[][] = [];

afterEach(async () => {
  for (const close of cleanup.reverse()) await close();
  cleanup = [];
  const pending = unmatchedRoutes;
  unmatchedRoutes = [];
  for (const unmatched of pending) expect(unmatched, 'requests without a fixture').toEqual([]);
});

async function connect(deps: ServerDeps) {
  const { client, close } = await connectClient(deps);
  cleanup.push(close);
  return client;
}

async function composedClient(now?: () => Date) {
  const fixtures = fixtureFetch(ROUTES);
  unmatchedRoutes.push(fixtures.unmatched);
  return connect(compose(sandboxConfig(), { fetch: fixtures.fetch, ...(now && { now }) }));
}

async function call(name: string, args: Record<string, unknown>) {
  const client = await composedClient();
  return client.callTool({ name, arguments: args });
}

function serverOver(repo: JudilibreRepository) {
  return connect({
    config: sandboxConfig(),
    getStatus: () => Promise.reject(new Error('not used')),
    sources: [
      createJudilibreSource({
        searchDecisions: createSearchJudilibre(repo),
        getDecision: createGetJudilibreDecision(repo),
        listTaxonomy: createListJudilibreTaxonomy(repo),
      }),
    ],
  });
}

const search = async (args: Record<string, unknown>, outcome = 'results') =>
  expectAnswer(await call(SEARCH, args), { source: SOURCE, outcome });
const read = async (args: Record<string, unknown>, outcome = 'found') =>
  expectAnswer(await call(DECISION, args), { source: SOURCE, outcome });
const list = async (args: Record<string, unknown>, outcome = 'results') =>
  expectAnswer(await call(TAXONOMY, args), { source: SOURCE, outcome });

// First in this file: Node 26.5 (V8 Maglev) answered a whole text with `next` at its end only
// while `sliceForJson` had been compiled on short texts and not yet on long ones.
describe('a long decision that fits one page, read after short ones', () => {
  it('the long text twice (24 052 characters): no part and no next, on every call', async () => {
    const shortId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
    const longId = 'bbbbbbbbbbbbbbbbbbbbbbbb';
    const client = await serverOver(
      fakeJudilibre({
        decisions: {
          [shortId]: decisionOf({ id: shortId, text: 'texte' }),
          [longId]: decisionOf({ id: longId, text: decision49.text.repeat(2) }),
        },
      }).repo,
    );
    const found = { source: SOURCE, outcome: 'found' };
    for (let i = 0; i < 10; i++) {
      expectAnswer(await client.callTool({ name: DECISION, arguments: { id: shortId } }), found);
    }
    for (let i = 0; i < 6; i++) {
      const a = expectAnswer(
        await client.callTool({ name: DECISION, arguments: { id: longId } }),
        found,
      );
      expect(a.part, `call ${i + 1}`).toBeNull();
      expect(a.next, `call ${i + 1}`).toBeNull();
      expect(a.text).toBe(decision49.text.repeat(2));
    }
  });
});

describe('judilibre_search_decisions', () => {
  it('forfait jours, exact phrase, chamber social, newest', async () => {
    const a = await search({
      query: 'forfait jours',
      match: 'exact_phrase',
      chamber: 'social',
      sort: 'newest',
    });
    expect(a.results).toBe(568);
    expect(a.page).toEqual({ number: 1, of: 57 });
    expect(a.order).toBe('newest_first');
    expect(a.next).toEqual({ page: 2 });
    expect(a.relaxed).toBe(false);
    expect(a.items).toHaveLength(10);
    const first = a.items[0];
    expect(first.id).toBe('6abcc10bc27382d099087409');
    expect(first.link).toBe(`${LINK}6abcc10bc27382d099087409`);
    expect(first.read_with).toEqual({ tool: DECISION, id: '6abcc10bc27382d099087409' });
    expect(first.chamber).toBe('Chambre sociale');
    expect(first.jurisdiction).toBe('cc');
    expect(first.title).toContain('Chambre sociale');
    expect(first.title).toContain('decision of 2026-09-30');
    expect(first.decided).toBe('2026-09-30');
    expect(first.numbers).toContain('25-14.434');
    for (const item of a.items) {
      expect(item.link).toBe(`${LINK}${item.id}`);
      expect(item.read_with).toEqual({ tool: DECISION, id: item.id });
    }
    expect(a.request).toEqual({
      tool: SEARCH,
      query: 'forfait jours',
      match: 'exact_phrase',
      jurisdiction: 'cc',
      chamber: 'social',
      sort: 'newest',
      page: 1,
      page_size: 10,
    });
    expect(a.cached).toEqual([]);
  });

  it('an unreasoned rejection keeps the source labels and is not in the Bulletin', async () => {
    const a = await search({ query: '23-20.348' });
    const hit = a.items[0];
    expect(hit.formation).toBe(
      'Formation restreinte RNSM/NA (rejet non spécialement motivé ou non-admission)',
    );
    expect(hit.solution).toBe('Rejet');
    expect(hit.publication).toEqual([]);
    expect(hit.ecli).toEqual(expect.any(String));
  });

  it('a court of appeal hit names its court, once', async () => {
    const a = await search({ query: 'bail', jurisdiction: 'ca' });
    const hit = a.items[0];
    expect(hit.title).toContain("Cour d'appel de Paris, Pôle 4 - Chambre 4");
    expect(hit.title).not.toContain("Cour d'appel, Cour d'appel de Paris");
    expect(hit.jurisdiction).toBe('ca');
    expect(hit.location).toBe("Cour d'appel de Paris");
    expect(hit.publication).toEqual([]);
  });

  it('zero hits says so and names the criteria', async () => {
    const a = await search({ query: 'licenciement' }, 'no_results');
    expect(a.results).toBe(0);
    expect(a.items).toEqual([]);
    expect(a.page).toEqual({ number: 1, of: 1 });
    expect(a.next).toBeNull();
    expect(a.warnings[0]).toMatch(
      /^No Judilibre decision matches "licenciement" with these criteria: /,
    );
  });

  it('a page past the end is no_results with the totals', async () => {
    const a = await search({ query: '24-16.924', page: 6 }, 'no_results');
    expect(a.results).toBe(1);
    expect(a.page).toEqual({ number: 6, of: 1 });
    expect(a.items).toEqual([]);
    expect(a.next).toBeNull();
    expect(a.warnings.join('\n')).not.toContain('No Judilibre decision matches');
  });
});

const LABELLED_FILTERS = {
  chamber: 'social',
  formation: 'frr',
  publication: 'bulletin',
  solution: 'rejet',
};
const LABELS = [
  'Chambre sociale',
  'Formation restreinte RNSM/NA (rejet non spécialement motivé ou non-admission)',
  'Publié au Bulletin',
  'Rejet',
];

describe('search criteria', () => {
  it('the request carries the filters as given', async () => {
    const a = await search({ query: 'forfait jours', ...LABELLED_FILTERS });
    expect(a.request).toMatchObject(LABELLED_FILTERS);
    expect(a.request.match).toBe('all_words');
  });

  it('a zero-hit answer lists the labelled criteria', async () => {
    const a = await search({ query: 'licenciement', ...LABELLED_FILTERS }, 'no_results');
    const warnings = a.warnings.join('\n');
    for (const label of LABELS) expect(warnings).toContain(label);
    expect(warnings).toContain('all words');
  });

  it('any_word is echoed in the request and in the zero-hit criteria', async () => {
    const a = await search({ query: 'forfait jours', match: 'any_word' });
    expect(a.request.match).toBe('any_word');
    const none = await search({ query: 'licenciement', match: 'any_word' }, 'no_results');
    expect(none.warnings[0]).toContain('any word');
  });
});

function hitOf(n: number): JudilibreHit {
  return {
    id: n.toString(16).padStart(24, '0'),
    jurisdiction: { key: 'cc', label: 'Cour de cassation' },
    chamber: { key: 'soc', label: 'Chambre sociale' },
    numbers: [`25-14.${String(n).padStart(3, '0')}`],
    ecli: `ECLI:FR:CCASS:2026:SO${String(n).padStart(5, '0')}`,
    formation: null,
    publication: [],
    decisionDate: '2026-09-30',
    solution: { key: 'rejet', label: 'Rejet' },
    solutionText: null,
    location: null,
    summary: 'S'.repeat(5000),
    highlights: ['H'.repeat(5000)],
  };
}

describe('search with a fake repository', () => {
  const ask = async (hits: JudilibreHit[], total: number, args: Record<string, unknown> = {}) => {
    const client = await serverOver(fakeJudilibre({ hits, total }).repo);
    const result = await client.callTool({ name: SEARCH, arguments: { query: 'x', ...args } });
    return expectAnswer(result, {
      source: SOURCE,
      outcome: total === 0 ? 'no_results' : 'results',
    });
  };

  it('cuts the summary at 600 and the excerpt at 700, and joins highlights', async () => {
    const hit = { ...hitOf(1), summary: 'S'.repeat(5000), highlights: ['un', 'deux'] };
    const a = await ask([hit], 1);
    expect(a.items[0].summary).toBe(`${'S'.repeat(599)}…`);
    expect(a.items[0].excerpt).toBe('un … deux');
    const long = await ask([hitOf(1)], 1);
    expect(long.items[0].excerpt).toBe(`${'H'.repeat(699)}…`);
    const bare = await ask([{ ...hitOf(1), summary: null, highlights: [] }], 1);
    expect(bare.items[0].summary).toBeNull();
    expect(bare.items[0].excerpt).toBeNull();
  });

  it('the publication labels are listed, a free-text outcome stands in for a missing one', async () => {
    const hit: JudilibreHit = {
      ...hitOf(1),
      publication: [
        { key: 'b', label: 'Publié au Bulletin' },
        { key: 'r', label: 'Publié au Rapport' },
      ],
      solution: null,
      solutionText: 'Confirme',
    };
    const a = await ask([hit], 1);
    expect(a.items[0].publication).toEqual(['Publié au Bulletin', 'Publié au Rapport']);
    expect(a.items[0].solution).toBe('Confirme');
  });

  it('a relaxed search says so', async () => {
    const fake = fakeJudilibre({ hits: [hitOf(1)] });
    const repo: JudilibreRepository = {
      ...fake.repo,
      search: async (q, ctx) => ({ ...(await fake.repo.search(q, ctx)), relaxed: true }),
    };
    const client = await serverOver(repo);
    const a = expectAnswer(await client.callTool({ name: SEARCH, arguments: { query: 'x y' } }), {
      source: SOURCE,
      outcome: 'results',
    });
    expect(a.relaxed).toBe(true);
    expect(a.warnings).toContain(
      'Judilibre found no exact match and loosened the search: these results match only some of the words.',
    );
    expect((await ask([hitOf(1)], 1)).relaxed).toBe(false);
  });

  it('a single hit; a total above 10 000 says only the first 10 000 are reachable', async () => {
    expect((await ask([hitOf(1)], 1)).results).toBe(1);
    const capped = await ask([hitOf(1)], 12_000);
    expect(capped.results).toBe(12_000);
    expect(capped.page.of).toBe(1000);
    expect(capped.warnings).toContain(
      'Only the first 10 000 are reachable by paging; narrow the search to see the others.',
    );
    expect((await ask([hitOf(1)], 9_999)).warnings).toEqual([]);
  });

  it('an unknown location key (a tribunal judiciaire) is kept as is', async () => {
    const hit: JudilibreHit = {
      ...hitOf(1),
      jurisdiction: { key: 'tj', label: 'Tribunal judiciaire' },
      chamber: null,
      location: { key: 'tj75056', label: 'tj75056' },
    };
    const a = await ask([hit], 1, { jurisdiction: 'tj' });
    expect(a.items[0].title).toContain('Tribunal judiciaire, tj75056 — decision of');
    expect(a.items[0].location).toBe('tj75056');
    expect(a.items[0].chamber).toBeNull();
  });

  it('a 20-hit page with long summaries and excerpts stays within the cap, saying what it left out', async () => {
    const hits = Array.from({ length: 20 }, (_, i) => ({
      ...hitOf(i + 1),
      summary: 'é"\\\n'.repeat(500),
      highlights: ['é"\\\n'.repeat(500)],
    }));
    const a = await ask(hits, 20, { page_size: 20 });
    expect(JSON.stringify(a).length).toBeLessThanOrEqual(MAX_TOOL_TEXT);
    if (a.items.length < 20) {
      expect(a.warnings).toContain(
        `(Only the first ${a.items.length} of 20 hits of this page fit — use a smaller "page_size".)`,
      );
    }
    expect(a.items.length).toBeGreaterThan(0);
  });
});

describe('judilibre_get_decision', () => {
  it('identity, outcome, attacked decision with its id, source date and the Légifrance pointer', async () => {
    const a = await read({ id: '6a0e9ff1cdc6046d47668703' });
    expect(a.id).toBe('6a0e9ff1cdc6046d47668703');
    expect(a.link).toBe(`${LINK}6a0e9ff1cdc6046d47668703`);
    expect(a.jurisdiction).toBe('cc');
    expect(a.solution).toContain('Rejet non spécialement motivé');
    expect(a.publication).toEqual([]);
    expect(a.source_updated).toBe('2026-05-29');
    expect(a.attacked.title).toContain("Cour d'appel de Paris");
    expect(a.attacked.read_with).toEqual({ tool: DECISION, id: '64953aa7aa086705db6f12ef' });
    expect(a.attacked.decided).toBe('2023-06-22');
    expect(a.attacked.number).toEqual(expect.any(String));
    expect(a.part).toBeNull();
    expect(a.next).toBeNull();
    expect(a.text).toBe(
      (loadFixture('62-decision-23-20.348-rnsm', 'judilibre') as { text: string }).text,
    );
    expect(a.other_source).toEqual({
      tool: 'legifrance_search_case_law',
      collection: 'judicial',
      ecli: a.ecli,
    });
    expect(a.ecli).toMatch(/^ECLI:FR:CCASS:/);
    expect(a.warnings).toContain("other_source searches Légifrance for this decision's ECLI.");
    expect(a.request).toEqual({ tool: DECISION, id: '6a0e9ff1cdc6046d47668703', offset: 0 });
    expect(JSON.stringify(a)).not.toContain('not case law');
  });

  it('the summary (sommaire), the titles, the visa and the files are given apart', async () => {
    const a = await read({ id: '6af2c6c06c2e1778126fe2c7' });
    expect(a.summary).toMatch(/^Il résulte des dispositions/);
    expect(a.titles.some((t: string) => t.includes('CONTRAT DE TRAVAIL, RUPTURE'))).toBe(true);
    expect(a.visa.length).toBeGreaterThan(0);
    expect(a.files).toHaveLength(2);
    for (const f of a.files) {
      expect(f).toEqual({
        name: expect.any(String),
        type: expect.any(String),
        link: expect.any(String),
      });
    }
    expect(a.zones).toEqual(expect.arrayContaining(['motivations']));
    expect(a.zone).toBeNull();
    expect(a.source_updated).toBe('2026-11-10');
    expect(a.ecli).toBe('ECLI:FR:CCASS:2026:SO00939');
  });

  it('a court of appeal decision names its court; source_updated is the fixture update_date', async () => {
    const a = await read({ id: '6aead2477a1020213711b3db' });
    expect(a.title).toContain("Cour d'appel de Paris, Pôle 4 - Chambre 4");
    expect(a.title).not.toContain("Cour d'appel, Cour d'appel de Paris");
    expect(a.jurisdiction).toBe('ca');
    expect(a.location).toBe("Cour d'appel de Paris");
    expect(a.source_updated).toBe(
      (loadFixture('49-decision-ca-paris', 'judilibre') as { update_date: string }).update_date,
    );
    expect(a.other_source).toBeNull();
    expect(a.warnings).not.toContain("other_source searches Légifrance for this decision's ECLI.");
  });

  it('a Cour de cassation decision without publication is not in the Bulletin (empty list)', async () => {
    expect((await read({ id: '6a0e9ff1cdc6046d47668703' })).publication).toEqual([]);
  });

  it('a Bulletin decision with zone motivations: joined segments and the Légifrance pointer', async () => {
    const a = await read({ id: '6af2c6c06c2e1778126fe2c7', zone: 'motivations' });
    expect(a.zone).toBe('motivations');
    expect(a.text).toContain('Réponse de la Cour');
    expect(a.text).toContain('[…]');
    expect(a.solution).toContain('Cassation partielle sans renvoi');
    expect(a.other_source).toEqual({
      tool: 'legifrance_search_case_law',
      collection: 'judicial',
      ecli: 'ECLI:FR:CCASS:2026:SO00939',
    });
    expect(a.request.zone).toBe('motivations');
  });

  it('a decision without zones with zone motivations: no such zone, full text shown', async () => {
    const a = await read({ id: '694252ab61c46255e1711cac', zone: 'motivations' });
    const note =
      'This decision has no zone markup, so no "motivations" zone; showing the full text.';
    expect(a.warnings.filter((w: string) => w === note)).toHaveLength(1);
    expect(a.warnings).not.toContain('This decision has no zone markup; showing the full text.');
    expect(a.zone).toBeNull();
    expect(a.zones).toEqual([]);
  });

  it('a decision without zones, no zone requested: no zone markup note', async () => {
    const a = await read({ id: '694252ab61c46255e1711cac' });
    expect(a.warnings).toContain('This decision has no zone markup; showing the full text.');
  });

  it('a Bulletin decision without zones gets the same note, with no claim about why', async () => {
    const a = await read({ id: '607976659ba5988459c49f42' });
    expect(a.publication).toContain('Publié au Bulletin');
    expect(a.warnings).toContain('This decision has no zone markup; showing the full text.');
    expect(JSON.stringify(a)).not.toContain('unpublished');
  });

  it('a court of appeal decision with zone moyens: the decision has zones, just not that one', async () => {
    const a = await read({ id: '6aead2477a1020213711b3db', zone: 'moyens' });
    expect(a.warnings).toContain('This decision has no "moyens" zone; showing the full text.');
    expect(a.zones.length).toBeGreaterThan(0);
    expect(a.zone).toBeNull();
    expect(a.warnings.join('\n')).not.toContain('no zone markup');
  });

  it('the same Bulletin decision with zone motivations: one note, then the full text', async () => {
    const a = await read({ id: '607976659ba5988459c49f42', zone: 'motivations' });
    const note =
      'This decision has no zone markup, so no "motivations" zone; showing the full text.';
    expect(a.warnings.filter((w: string) => w === note)).toHaveLength(1);
    expect(a.zone).toBeNull();
    expect(a.text.length).toBeGreaterThan(0);
  });

  it('unknown id', async () => {
    const a = await read({ id: '000000000000000000000000' }, 'not_found');
    expect(a.id).toBe('000000000000000000000000');
    expect(a.warnings).toContain('No Judilibre decision with id "000000000000000000000000".');
    expect(a.warnings.join('\n')).toContain('judilibre_search_decisions');
  });

  it('an offset past the end of the text is an invalid_input error', async () => {
    const e = expectToolError(
      await call(DECISION, { id: '6aead2477a1020213711b3db', offset: 999_999 }),
      'invalid_input',
    );
    expect(e.request).toEqual({
      tool: DECISION,
      id: '6aead2477a1020213711b3db',
      offset: 999_999,
    });
  });

  it('a long decision read page by page: every page fits and the pages rebuild the text (332 line breaks)', async () => {
    const client = await composedClient();
    let rebuilt = '';
    let offset = 0;
    let pages = 0;
    for (; pages < 10; pages++) {
      const a = expectAnswer(
        await client.callTool({
          name: DECISION,
          arguments: { id: '6aead2477a1020213711b3db', offset },
        }),
        { source: SOURCE, outcome: 'found' },
      );
      expect(JSON.stringify(a).length).toBeLessThanOrEqual(MAX_TOOL_TEXT);
      rebuilt += a.text;
      if (a.next === null) break;
      offset = a.next.offset;
    }
    expect(rebuilt).toBe(decision49.text);
  });

  it('a text past 60 000 characters is read over at least two pages and rebuilds exactly', async () => {
    const client = await composedClient();
    let rebuilt = '';
    let offset = 0;
    let pages = 0;
    let previous = -1;
    for (; pages < 10; pages++) {
      const a = expectAnswer(
        await client.callTool({ name: DECISION, arguments: { id: LONG_ID, offset } }),
        { source: SOURCE, outcome: 'found' },
      );
      expect(JSON.stringify(a).length).toBeLessThanOrEqual(MAX_TOOL_TEXT);
      expect(a.part).toEqual({
        from: offset,
        to: a.next === null ? LONG_TEXT.length : a.next.offset,
        of: LONG_TEXT.length,
      });
      expect(a.part.from).toBeGreaterThan(previous);
      previous = a.part.from;
      expect(a.other_source).toBeNull(); // a court of appeal decision: no Légifrance pointer
      rebuilt += a.text;
      if (a.next === null) break;
      offset = a.next.offset;
    }
    expect(pages, 'the last page index: at least two pages were read').toBeGreaterThanOrEqual(1);
    expect(rebuilt).toBe(LONG_TEXT);
  });
});

describe('judilibre_get_decision over a fake repository', () => {
  const id = 'aaaaaaaaaaaaaaaaaaaaaaaa';
  async function readFake(over: Parameters<typeof decisionOf>[0], offset = 0) {
    const client = await serverOver(
      fakeJudilibre({ decisions: { [id]: decisionOf({ id, text: 'texte', ...over }) } }).repo,
    );
    return expectAnswer(await client.callTool({ name: DECISION, arguments: { id, offset } }), {
      source: SOURCE,
      outcome: 'found',
    });
  }

  it('a 100 000-character text: every page fits, and the offsets rebuild the text', async () => {
    const text = Array.from({ length: 100_000 / 10 }, (_, i) => `w${String(i).padStart(8, '0')}`)
      .join(' ')
      .slice(0, 100_000);
    let rebuilt = '';
    let offset = 0;
    for (let guard = 0; guard < 10; guard++) {
      const a = await readFake({ text, ecli: 'ECLI:FR:CCASS:2026:SO00001' }, offset);
      expect(a.link).toBe(`${LINK}${id}`);
      rebuilt += a.text;
      if (a.next === null) {
        expect(a.other_source).not.toBeNull();
        break;
      }
      expect(a.other_source).toBeNull();
      offset = a.next.offset;
    }
    expect(rebuilt).toBe(text);
  });

  it('text dense with quotes, backslashes and line breaks still fits and rebuilds exactly', async () => {
    const text = '"a\\b"\nc\r\n'.repeat(12_000);
    let rebuilt = '';
    let offset = 0;
    for (let guard = 0; guard < 20; guard++) {
      const a = await readFake({ text, summary: 'S'.repeat(2_500) }, offset);
      rebuilt += a.text;
      if (a.next === null) break;
      offset = a.next.offset;
    }
    expect(rebuilt).toBe(text);
  });

  it('a very long head keeps room for the text and gives a valid continuation offset', async () => {
    const long = (n: number, c: string) => Array.from({ length: n }, () => c.repeat(500));
    const a = await readFake({
      text: 'texte '.repeat(10_000),
      summary: 'S'.repeat(2_000),
      titles: ['T'.repeat(2_000)],
      visa: long(30, 'V'),
      rapprochements: long(30, 'R'),
      files: Array.from({ length: 30 }, (_, i) => ({
        name: 'F'.repeat(500),
        type: 'pdf',
        url: `https://example.test/${i}/${'u'.repeat(500)}`,
      })),
    });
    expect(a.text).toContain('texte texte');
    expect(a.warnings.join('\n')).toMatch(/\(\+\d+ more\)/);
    expect(a.next.offset).toBeGreaterThanOrEqual(2_000);
    expect(a.part.from).toBe(0);
  });

  it('the head is given on the first page only', async () => {
    const text = 'texte '.repeat(10_000);
    const first = await readFake({ text, summary: 'sommaire', visa: ['v'], titles: ['t'] });
    expect(first.summary).toBe('sommaire');
    const later = await readFake(
      { text, summary: 'sommaire', visa: ['v'], titles: ['t'] },
      first.next.offset,
    );
    expect(later.summary).toBeNull();
    expect(later.titles).toEqual([]);
    expect(later.visa).toEqual([]);
    expect(later.rapprochements).toEqual([]);
    expect(later.files).toEqual([]);
    expect(later.id).toBe(id);
  });

  it('visa: 30 items shown, "(+N more)" after the cut, "…" on a cut item', async () => {
    const a = await readFake({ visa: Array.from({ length: 35 }, () => 'V'.repeat(600)) });
    expect(a.warnings).toContain('Visa: (+5 more)');
    expect(a.visa).toHaveLength(30);
    expect(a.visa[0]).toBe(`${'V'.repeat(499)}…`);
  });

  it('rapprochements and files: "(+N more)"', async () => {
    const a = await readFake({
      rapprochements: Array.from({ length: 32 }, (_, i) => `R${i}`),
      files: Array.from({ length: 31 }, (_, i) => ({ name: `f${i}`, type: 'pdf', url: `u${i}` })),
    });
    expect(a.warnings).toContain('Rapprochements: (+2 more)');
    expect(a.warnings).toContain('Files: (+1 more)');
    expect(a.files).toHaveLength(30);
    expect(a.files[0]).toEqual({ name: 'f0', type: 'pdf', link: 'u0' });
  });

  it('an offset at the end of the text is an invalid_input error; offset 0 reads an empty text', async () => {
    const client = await serverOver(
      fakeJudilibre({ decisions: { [id]: decisionOf({ id, text: 'texte' }) } }).repo,
    );
    const e = expectToolError(
      await client.callTool({ name: DECISION, arguments: { id, offset: 5 } }),
      'invalid_input',
    );
    expect(e.error.message).toBe('"offset" 5 is past the end of the text (5 characters).');
    expect(e.request).toEqual({ tool: DECISION, id, offset: 5 });
    const a = await readFake({ text: '' });
    expect(a.text).toBe('');
    expect(a.part).toBeNull();
    expect(a.next).toBeNull();
  });

  it('a cut title ends with "…"; a cut summary too', async () => {
    const a = await readFake({ titles: ['T'.repeat(3000)], summary: 'S'.repeat(3000) });
    expect(a.titles[0]).toBe(`${'T'.repeat(499)}…`);
    expect(a.summary).toBe(`${'S'.repeat(1999)}…`);
  });

  it('a list within the limit has no "more" marker', async () => {
    const a = await readFake({ visa: ['a', 'b'] });
    expect(a.visa).toEqual(['a', 'b']);
    expect(a.warnings.join('\n')).not.toContain('more)');
  });

  it('an attacked decision without a Judilibre id has no pointer; a cut title keeps one line', async () => {
    const a = await readFake({
      contested: {
        title: "Cour d'appel de Paris\nB1",
        number: null,
        date: null,
        judilibreId: null,
      },
    });
    expect(a.attacked).toEqual({
      title: "Cour d'appel de Paris, B1",
      number: null,
      decided: null,
      read_with: null,
    });
    expect((await readFake({})).attacked).toBeNull();
  });
});

describe('judilibre_list_taxonomy', () => {
  it('chamber list', async () => {
    const a = await list({ list: 'chamber' });
    expect(a.list).toBe('chamber');
    expect(a.jurisdiction).toBe('cc');
    expect(a.contains).toBeNull();
    expect(a.free_text).toBe(false);
    expect(a.items).toContainEqual({ key: 'soc', label: 'Chambre sociale', group: null });
    expect(a.results).toBe(a.total);
    expect(a.results).toBe(a.items.length);
    expect(a.page).toEqual({ number: 1, of: 1 });
    expect(a.next).toBeNull();
    expect(a.cached).toEqual([
      { what: 'Judilibre chamber list (cc)', retrieved: expect.stringMatching(/Z$/) },
    ]);
    expect(a.request).toEqual({ tool: TAXONOMY, list: 'chamber', jurisdiction: 'cc', page: 1 });
  });

  it('contains keeps the matching labels and counts the whole list apart', async () => {
    const a = await list({ list: 'chamber', contains: 'sociale' });
    expect(a.contains).toBe('sociale');
    expect(a.results).toBe(1);
    expect(a.total).toBeGreaterThan(1);
    expect(a.items[0].key).toBe('soc');
  });

  it('no label contains the words: no_results, with the list size', async () => {
    const a = await list({ list: 'chamber', contains: 'zzzzzz' }, 'no_results');
    expect(a.results).toBe(0);
    expect(a.items).toEqual([]);
    expect(a.warnings).toContain(
      `Judilibre has no chamber value matching "zzzzzz" for Cour de cassation (${a.total} values in the list).`,
    );
    expect(a.cached).toHaveLength(1);
  });

  it('chamber for the courts of appeal is free text', async () => {
    const a = await list({ list: 'chamber', jurisdiction: 'ca' }, 'no_results');
    expect(a.free_text).toBe(true);
    expect(a.jurisdiction).toBe('ca');
    expect(a.items).toEqual([]);
    expect(a.results).toBe(0);
    expect(a.cached).toEqual([]);
    expect(a.warnings).toEqual([
      'For Cour d\'appel, Judilibre records chambers as free text, so there is no list to filter on: put the words in "query" instead.',
    ]);
  });

  describe('over a fake repository', () => {
    const entries = (n: number): TaxonomyEntry[] =>
      Array.from({ length: n }, (_, i) => ({
        key: `k${i}`,
        label: `Valeur ${i}`,
        group: i < 3 ? 'Premier' : 'Second',
      }));
    const ask = async (n: number, args: Record<string, unknown>, outcome = 'results') => {
      const client = await serverOver(fakeJudilibre({ taxonomies: { theme: entries(n) } }).repo);
      return expectAnswer(
        await client.callTool({ name: TAXONOMY, arguments: { list: 'theme', ...args } }),
        { source: SOURCE, outcome },
      );
    };

    it('pages a long list, 200 values at most per page, and each page past the first is reachable', async () => {
      const first = await ask(450, {});
      expect(first.items).toHaveLength(200);
      expect(first.results).toBe(450);
      expect(first.page).toEqual({ number: 1, of: 3 });
      expect(first.next).toEqual({ page: 2 });
      const last = await ask(450, { page: 3 });
      expect(last.items).toHaveLength(50);
      expect(last.next).toBeNull();
      expect(last.items[0].key).toBe('k400');
    });

    it('a page past the end is no_results', async () => {
      const a = await ask(450, { page: 4 }, 'no_results');
      expect(a.items).toEqual([]);
      expect(a.results).toBe(450);
      expect(a.page).toEqual({ number: 4, of: 3 });
      expect(a.next).toBeNull();
    });

    it('keeps the group of each value', async () => {
      const a = await ask(5, {});
      expect(a.items.map((i: { group: string }) => i.group)).toEqual([
        'Premier',
        'Premier',
        'Premier',
        'Second',
        'Second',
      ]);
    });

    it('long labels are paged by the characters they take, and every page fits', async () => {
      const long = Array.from({ length: 150 }, (_, i) => ({
        key: `k${i}`,
        label: `${'é"'.repeat(300)}${i}`,
        group: null,
      }));
      const client = await serverOver(fakeJudilibre({ taxonomies: { theme: long } }).repo);
      const seen: string[] = [];
      for (let page = 1; page < 20; page++) {
        const a = expectAnswer(
          await client.callTool({ name: TAXONOMY, arguments: { list: 'theme', page } }),
          { source: SOURCE, outcome: 'results' },
        );
        seen.push(...a.items.map((i: { key: string }) => i.key));
        if (a.next === null) break;
        expect(a.next).toEqual({ page: page + 1 });
      }
      expect(seen).toHaveLength(150);
    });
  });

  it('a second call within 24 h keeps the first fetch time, earlier than its own retrieved', async () => {
    // The clock advances one minute per reading.
    let t = Date.UTC(2026, 10, 16, 8, 0, 0);
    const client = await composedClient(() => {
      t += 60_000;
      return new Date(t);
    });
    const ask = async () =>
      expectAnswer(await client.callTool({ name: TAXONOMY, arguments: { list: 'chamber' } }), {
        source: SOURCE,
        outcome: 'results',
      });
    const first = await ask();
    const second = await ask();
    expect(second.cached[0].retrieved).toBe(first.cached[0].retrieved);
    expect(second.cached[0].retrieved < second.retrieved).toBe(true);
  });
});
