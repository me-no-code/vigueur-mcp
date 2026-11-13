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
import { createLegifranceSource } from '../../../src/tools/legifrance/index.js';
import { fakeLegifrance } from '../../helpers/fake-case-law.js';
import {
  bodyField,
  type FixtureRoute,
  fixtureFetch,
  sandboxConfig,
} from '../../helpers/fixture-fetch.js';
import { connectClient, firstText } from '../../helpers/mcp-client.js';

let cleanup: Array<() => Promise<void>> = [];
let unmatchedRoutes: string[][] = [];

afterEach(async () => {
  for (const close of cleanup.reverse()) await close();
  cleanup = [];
  const pending = unmatchedRoutes;
  unmatchedRoutes = [];
  for (const unmatched of pending) expect(unmatched, 'requests without a fixture').toEqual([]);
});

const fondIs = (fond: string) => (body: unknown) => bodyField('fond', fond)(body);

/** Search and consult answers recorded in research (fixtures 121-154, 42-46, 138). */
const ROUTES: readonly FixtureRoute[] = [
  { path: '/search', when: fondIs('CNIL'), fixture: '128-search-cnil-all-date-decision-desc' },
  { path: '/search', when: fondIs('CONSTIT'), fixture: '138-search-constit-num-dec-2026-1217' },
  { path: '/search', when: fondIs('JURI'), fixture: '134-search-juri-champ-ecli' },
  { path: '/search', when: fondIs('CETAT'), fixture: '125-search-cetat-all-date-desc' },
  { path: '/search', when: fondIs('JUFI'), fixture: '129-search-jufi-all-date-desc' },
  {
    path: '/consult/juri',
    when: bodyField('textId', 'JURITEXT000053197030'),
    fixture: '42-consult-juri-cass',
  },
  {
    path: '/consult/juri',
    when: bodyField('textId', 'CETATEXT000054960489'),
    fixture: '43-consult-juri-cetat',
  },
  {
    path: '/consult/juri',
    when: (b) => bodyField('textId', 'CONSTEXT000054952962')(b),
    fixture: '44-consult-juri-constit',
  },
  {
    path: '/consult/juri',
    when: bodyField('textId', 'JUFITEXT000055005642'),
    fixture: '46-consult-juri-jufi',
  },
  {
    path: '/consult/cnil',
    when: bodyField('textId', 'CNILTEXT000053716494'),
    fixture: '45-consult-cnil',
  },
  // An unknown id: Légifrance answers HTTP 400 "L'expression à valider est fausse."
  {
    path: '/consult/juri',
    when: bodyField('textId', 'JURITEXT000099999999'),
    fixture: '65-err-lawDecree-unknown',
    status: 400,
  },
];

async function call(name: string, args: Record<string, unknown>) {
  const fixtures = fixtureFetch([...ROUTES]);
  unmatchedRoutes.push(fixtures.unmatched);
  const { client, close } = await connectClient(
    compose(sandboxConfig(), { fetch: fixtures.fetch, today: () => '2026-11-13' }),
  );
  cleanup.push(close);
  const result = await client.callTool({ name, arguments: args });
  return { result, text: firstText(result), calls: fixtures.calls };
}

const count = (text: string, needle: string) => text.split(needle).length - 1;

describe('legifrance_search_case_law', () => {
  it('finds a judicial decision by number, with its source, its full-text pointer and the coverage note', async () => {
    const { text } = await call('legifrance_search_case_law', {
      collection: 'judicial',
      number: '24-16.924',
    });
    expect(text).toContain(
      'Source: Légifrance · https://www.legifrance.gouv.fr/juri/id/JURITEXT000053197030',
    );
    expect(text).toContain('Full text: legifrance_get_decision id "JURITEXT000053197030"');
    expect(text).toContain(LEGIFRANCE_CASE_LAW_COVERAGE_NOTE);
    expect(text).toContain('n° 24-16.924');
  });

  it('puts a Source line and a Full text line on every hit, on every collection', async () => {
    for (const collection of ['judicial', 'administrative', 'cnil', 'financial']) {
      const { text } = await call('legifrance_search_case_law', {
        collection,
        page_size: 20,
        sort: 'newest',
      });
      const hits = (text.match(/^\d+\. /gm) ?? []).length;
      expect(hits, collection).toBeGreaterThan(0);
      expect(count(text, 'Source: Légifrance · '), collection).toBe(hits);
      expect(count(text, 'Full text: '), collection).toBe(hits);
      expect(text.length, collection).toBeLessThanOrEqual(MAX_TOOL_TEXT);
    }
  });

  it('shows the court, the decision date and the title of the newest CNIL deliberation', async () => {
    const { text } = await call('legifrance_search_case_law', {
      collection: 'cnil',
      sort: 'newest',
    });
    const first = text.split('\n').find((l) => l.startsWith('1. '));
    expect(first).toContain('Délibération');
    expect(first).toContain('decision of 2026-11-05');
    expect(text).not.toContain(LEGIFRANCE_CASE_LAW_COVERAGE_NOTE);
    expect(text).toMatch(/^Légifrance — CNIL: \d+ decisions/);
  });

  it('explains joined constitutional numbers when a number without "/" finds nothing', async () => {
    const { text } = await call('legifrance_search_case_law', {
      collection: 'constitutional',
      number: '2026-1217',
    });
    expect(text).toContain('No Conseil constitutionnel (CONSTIT) decision on Légifrance matches');
    expect(text).toContain('combined number');
  });

  it('never prints "unpublished" or "inédit" for a hit without a publication', async () => {
    const { text } = await call('legifrance_search_case_law', {
      collection: 'administrative',
      sort: 'newest',
    });
    expect(text.toLowerCase()).not.toContain('unpublished');
  });

  it('rejects the sort "oldest"', async () => {
    const { result } = await call('legifrance_search_case_law', {
      collection: 'cnil',
      sort: 'oldest',
    });
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

  it.each(ids)('%s: the page starts with its identity and carries its Source line', async (id) => {
    const { result, text } = await call('legifrance_get_decision', { id });
    expect(result.isError).toBeFalsy();
    expect(text).toMatch(/^[^\n]+ — decision of \d{4}-\d{2}-\d{2}/);
    expect(text).toContain('Source: Légifrance · https://www.legifrance.gouv.fr/');
    expect(text).toContain('(official page, constructed link)');
    expect(text).toContain('── Text ──');
    expect(text.length).toBeLessThanOrEqual(MAX_TOOL_TEXT);
  });

  it('the Conseil constitutionnel decision shows its official pages', async () => {
    const { text } = await call('legifrance_get_decision', { id: 'CONSTEXT000054952962' });
    expect(text).toContain(
      'Conseil constitutionnel page: https://www.conseil-constitutionnel.fr/decision/2026/20261217_1218QPC.htm',
    );
    expect(text).toContain('Published in the Journal officiel: ');
  });

  it('the CNIL deliberation shows its status as Légifrance labels it', async () => {
    const { text } = await call('legifrance_get_decision', { id: 'CNILTEXT000053716494' });
    expect(text).toContain('Status as labelled by Légifrance: ');
  });

  it('a Cour de cassation decision shows its attacked decision and the Judilibre pointer', async () => {
    const { text } = await call('legifrance_get_decision', { id: 'JURITEXT000053197030' });
    expect(text).toContain("Attacked decision: Cour d'appel de Bordeaux, decision of 2024-05-29");
    expect(text).toContain('ECLI:FR:CCASS:2025:SO01200');
    expect(
      text
        .trimEnd()
        .endsWith(
          'Same decision on Judilibre (usually earlier, with zones): judilibre_search_decisions with "query": "ECLI:FR:CCASS:2025:SO01200".',
        ),
    ).toBe(true);
  });

  it('answers "No Légifrance decision" for an unknown id, with the coverage note for a JURITEXT id', async () => {
    const { result, text } = await call('legifrance_get_decision', {
      id: 'JURITEXT000099999999',
    });
    expect(result.isError).toBeFalsy();
    expect(text).toContain('No Légifrance decision with id "JURITEXT000099999999".');
    expect(text).toContain('Find decisions with legifrance_search_case_law.');
    expect(text).toContain(LEGIFRANCE_CASE_LAW_COVERAGE_NOTE);
  });

  it('rejects an offset past the end of the text', async () => {
    const { result, text } = await call('legifrance_get_decision', {
      id: 'JURITEXT000053197030',
      offset: 10_000_000,
    });
    expect(result.isError).toBe(true);
    expect(text).toContain('offset');
  });
});

describe('a long decision', () => {
  const long: LegifranceDecision = {
    id: 'CETATEXT000054960489',
    collection: 'administrative',
    title: 'Conseil d’État, 2026',
    court: "Conseil d'État",
    chamber: null,
    nature: 'Décision',
    decisionDate: '2026-01-02',
    numbers: ['400000'],
    ecli: null,
    solution: null,
    publication: null,
    summary: null,
    attacked: null,
    text: 'abcdefghij '.repeat(9_091),
    constitutionalCouncilUrl: null,
    joUrl: null,
    labelledStatus: null,
    publishedOn: null,
  };

  it('is paged under 40 000 characters, each page with its Source line', async () => {
    const unused = () => Promise.reject(new Error('not used'));
    const source = createLegifranceSource({
      getArticle: unused,
      getArticleHistory: unused,
      searchLegislation: unused,
      listChanges: unused,
      getText: unused,
      browseCode: unused,
      latestJo: unused,
      listReferenceValues: unused,
      searchCaseLaw: unused,
      getDecision: async (_: { id: string }, _ctx?: CallContext) => ({
        kind: 'found' as const,
        decision: long,
      }),
    });
    const { client, close } = await connectClient({
      config: sandboxConfig(),
      getStatus: () => Promise.reject(new Error('not used')),
      sources: [source],
    });
    cleanup.push(close);
    let offset = 0;
    let pages = 0;
    for (;;) {
      const result = await client.callTool({
        name: 'legifrance_get_decision',
        arguments: { id: long.id, offset },
      });
      const text = firstText(result);
      expect(result.isError).toBeFalsy();
      expect(text.length).toBeLessThanOrEqual(MAX_TOOL_TEXT);
      expect(text).toContain('Source: Légifrance · https://www.legifrance.gouv.fr/ceta/id/');
      expect(text).toMatch(/^Conseil d'État — decision of 2026-01-02 — n° 400000/);
      pages++;
      const next = /"offset": (\d+)/.exec(text.split('\n').slice(-2).join('\n'));
      if (!next) break;
      offset = Number(next[1]);
      expect(pages).toBeLessThan(10);
    }
    expect(pages).toBeGreaterThanOrEqual(3);
  });
});

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
  return firstText(await client.callTool({ name, arguments: args }));
}

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

describe('search hit identity and header criteria', () => {
  it('a hit whose title did not parse shows the raw title, even with a date', async () => {
    const raw = 'Un titre que la grammaire ne reconnaît pas, 2 janvier 2026';
    const repo = fakeLegifrance({
      hits: [hitOf({ title: raw, court: null, numbers: [], decisionDate: '2026-01-02' })],
    }).repo;
    const text = await callOver(repo, 'legifrance_search_case_law', { collection: 'judicial' });
    expect(text).toContain(`1. ${raw}\n`);
    expect(text).not.toContain('decision of 2026-01-02');
  });

  it('the header echoes the normalised number that was searched', async () => {
    const text = await callOver(
      fakeLegifrance({ hits: [hitOf()] }).repo,
      'legifrance_search_case_law',
      {
        collection: 'judicial',
        number: '2416924',
      },
    );
    expect(text.split('\n')[0]).toContain('n° 24-16.924');
    expect(text.split('\n')[0]).not.toContain('2416924');
  });

  it('the chamber filter reads with the Légifrance label, not the Judilibre one', async () => {
    const text = await callOver(fakeLegifrance({ hits: [] }).repo, 'legifrance_search_case_law', {
      collection: 'judicial',
      chamber: 'commercial',
    });
    expect(text).toContain('Chambre commerciale, financière et économique');
  });

  it('a CNIL deliberation of the formation restreinte keeps its act kind', async () => {
    const { text } = await call('legifrance_search_case_law', {
      collection: 'cnil',
      sort: 'newest',
      page_size: 20,
    });
    const line = text.split('\n').find((l) => l.includes('SAN-2026-015'));
    expect(line).toMatch(/^\d+\. Délibération, /);
  });
});

describe('Title line on CNIL and Conseil constitutionnel decision pages', () => {
  it('CNIL: the title is shown verbatim at offset 0', async () => {
    const { text } = await call('legifrance_get_decision', { id: 'CNILTEXT000053716494' });
    expect(text).toMatch(/^Title: Délibération /m);
  });

  it('Conseil constitutionnel: the title is shown at offset 0 and cut at 300 characters', async () => {
    const { text } = await call('legifrance_get_decision', { id: 'CONSTEXT000054952962' });
    expect(text).toMatch(/^Title: /m);
    const long = { ...decisionFixture(), title: 'T'.repeat(400) };
    const cut = await callOver(
      fakeLegifrance({ decisions: { [long.id]: long } }).repo,
      'legifrance_get_decision',
      { id: long.id },
    );
    expect(cut).toContain(`Title: ${'T'.repeat(299)}…`);
  });

  it('is not repeated on later pages', async () => {
    const long = { ...decisionFixture(), text: 'abcdefghij '.repeat(9_091) };
    const repo = fakeLegifrance({ decisions: { [long.id]: long } }).repo;
    const second = await callOver(repo, 'legifrance_get_decision', { id: long.id, offset: 100 });
    expect(second).not.toContain('Title: ');
  });
});

function decisionFixture(): LegifranceDecision {
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
  };
}
