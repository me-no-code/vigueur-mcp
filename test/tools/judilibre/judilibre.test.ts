import { afterEach, describe, expect, it } from 'vitest';
import { compose } from '../../../src/compose.js';
import type { ServerDeps } from '../../../src/server.js';
import {
  createGetJudilibreDecision,
  createListJudilibreTaxonomy,
  createSearchJudilibre,
} from '../../../src/services/case-law/judilibre.js';
import type { JudilibreHit, JudilibreRepository } from '../../../src/services/case-law/ports.js';
import { MAX_TOOL_TEXT } from '../../../src/tools/format.js';
import { createJudilibreSource } from '../../../src/tools/judilibre/index.js';
import { decisionOf, fakeJudilibre } from '../../helpers/fake-case-law.js';
import { type FixtureRoute, fixtureFetch, sandboxConfig } from '../../helpers/fixture-fetch.js';
import { connectClient, firstText } from '../../helpers/mcp-client.js';

const J = (path: string, fixture: string, whenQuery?: FixtureRoute['whenQuery']): FixtureRoute => ({
  api: 'judilibre',
  path,
  fixture,
  ...(whenQuery && { whenQuery }),
});

const ROUTES: FixtureRoute[] = [
  J(
    '/search',
    '11-search-eval-forfait-jours-exact-cc-soc-date-desc',
    (q) => q.get('query') === 'forfait jours',
  ),
  J('/search', '61-search-number-23-20.348-rnsm', (q) => q.get('query') === '23-20.348'),
  J('/search', '19-search-type-arret-cc-recent', (q) => q.get('query') === 'licenciement'),
  J('/search', '21-search-ca-paris-bail-date-desc', (q) => q.get('query') === 'bail'),
  J('/search', '15-search-page-beyond-total', (q) => q.get('query') === '24-16.924'),
  J('/decision', '49-decision-ca-paris', (q) => q.get('id') === '6aead2477a1020213711b3db'),
  J('/decision', '62-decision-23-20.348-rnsm', (q) => q.get('id') === '6a0e9ff1cdc6046d47668703'),
  J(
    '/decision',
    '47-decision-23-23.782-bulletin-files',
    (q) => q.get('id') === '6af2c6c06c2e1778126fe2c7',
  ),
  J('/decision', '45-decision-24-16.924', (q) => q.get('id') === '694252ab61c46255e1711cac'),
  J(
    '/decision',
    '67-decision-11-16.304-bulletin-no-zones',
    (q) => q.get('id') === '607976659ba5988459c49f42',
  ),
  {
    ...J(
      '/decision',
      '53-err-decision-unknown-id',
      (q) => q.get('id') === '000000000000000000000000',
    ),
    status: 404,
  },
  J('/taxonomy', '29-taxonomy-cc-chamber', (q) => q.get('id') === 'chamber'),
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

async function call(name: string, args: Record<string, unknown>) {
  const fixtures = fixtureFetch(ROUTES);
  unmatchedRoutes.push(fixtures.unmatched);
  const client = await connect(compose(sandboxConfig(), { fetch: fixtures.fetch }));
  const result = await client.callTool({ name, arguments: args });
  return { result, text: firstText(result) };
}

const count = (text: string, needle: string) => text.split(needle).length - 1;

describe('judilibre_search_decisions', () => {
  it('forfait jours, exact phrase, chamber social, newest', async () => {
    const { result, text } = await call('judilibre_search_decisions', {
      query: 'forfait jours',
      match: 'exact_phrase',
      chamber: 'social',
      sort: 'newest',
    });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toBeUndefined();
    expect(text).toContain('568 decisions');
    expect(text).toContain('Chambre sociale');
    expect(text).toContain('decision of 2026-09-30');
    expect(text).toContain('25-14.434');
    expect(text).toContain(
      'Source: Judilibre · https://www.courdecassation.fr/decision/6abcc10bc27382d099087409',
    );
    expect(text).toContain('Full text: judilibre_get_decision id "6abcc10bc27382d099087409"');
    expect(text).toContain('Next page: "page": 2');
    const hits = count(text, 'decision of ');
    expect(hits).toBe(10);
    expect(count(text, 'Source: Judilibre · ')).toBe(hits);
    expect(count(text, 'Full text: ')).toBe(hits);
    expect(text.length).toBeLessThanOrEqual(MAX_TOOL_TEXT);
  });

  it('an unreasoned rejection keeps the source labels', async () => {
    const { text } = await call('judilibre_search_decisions', { query: '23-20.348' });
    expect(text).toContain(
      'Formation restreinte RNSM/NA (rejet non spécialement motivé ou non-admission)',
    );
    expect(text).toContain('Rejet');
    expect(text).toContain('not published in the Bulletin');
  });

  it('a court of appeal hit names its court, once', async () => {
    const { text } = await call('judilibre_search_decisions', {
      query: 'bail',
      jurisdiction: 'ca',
    });
    expect(text).toContain("Cour d'appel de Paris, Pôle 4 - Chambre 4");
    expect(text).not.toContain("Cour d'appel, Cour d'appel de Paris");
  });

  it('zero hits says so and names the criteria', async () => {
    const { result, text } = await call('judilibre_search_decisions', { query: 'licenciement' });
    expect(result.isError).toBeFalsy();
    expect(text).toContain('No Judilibre decision matches "licenciement"');
    expect(text).toContain('legifrance_search_case_law');
  });
});

describe('judilibre_get_decision', () => {
  it('source line, verbatim text, attacked decision with its id', async () => {
    const { text } = await call('judilibre_get_decision', { id: '6a0e9ff1cdc6046d47668703' });
    expect(text).toContain(
      'Source: Judilibre · https://www.courdecassation.fr/decision/6a0e9ff1cdc6046d47668703 (official page, constructed link)',
    );
    expect(text).toContain('Rejet non spécialement motivé');
    expect(text).toContain("Attacked decision: Cour d'appel de Paris");
    expect(text).toContain('Full text: judilibre_get_decision id "64953aa7aa086705db6f12ef"');
    expect(text).not.toContain('not case law');
  });

  it('the summary (sommaire) and the titles are shown apart', async () => {
    const { text } = await call('judilibre_get_decision', { id: '6af2c6c06c2e1778126fe2c7' });
    expect(text).toContain('Summary (sommaire): Il résulte des dispositions');
    expect(text).toMatch(/^Titles: .*CONTRAT DE TRAVAIL, RUPTURE/m);
  });

  it('a court of appeal decision names its court', async () => {
    const { text } = await call('judilibre_get_decision', { id: '6aead2477a1020213711b3db' });
    expect(text).toContain("Cour d'appel de Paris, Pôle 4 - Chambre 4");
    expect(text).not.toContain("Cour d'appel, Cour d'appel de Paris");
  });

  it('a Cour de cassation decision without publication says it is not in the Bulletin', async () => {
    const { text } = await call('judilibre_get_decision', { id: '6a0e9ff1cdc6046d47668703' });
    expect(text).toContain('not published in the Bulletin');
  });

  it('a Bulletin decision with zone motivations: joined segments and the Légifrance pointer', async () => {
    const { text } = await call('judilibre_get_decision', {
      id: '6af2c6c06c2e1778126fe2c7',
      zone: 'motivations',
    });
    expect(text).toContain('Zone: motivations');
    expect(text).toContain('Réponse de la Cour');
    expect(text).toContain('[…]');
    expect(text).toContain('Cassation partielle sans renvoi');
    expect(text).toContain('legifrance_search_case_law');
    expect(text).toContain('ECLI:FR:CCASS:2026:SO00939');
  });

  it('a decision without zones with zone motivations: no such zone, full text shown', async () => {
    const { text } = await call('judilibre_get_decision', {
      id: '694252ab61c46255e1711cac',
      zone: 'motivations',
    });
    expect(text).toContain(
      'This decision has no zone markup, so no "motivations" zone; showing the full text.',
    );
    expect(count(text, 'showing the full text')).toBe(1);
  });

  it('a decision without zones, no zone requested: no zone markup note', async () => {
    const { text } = await call('judilibre_get_decision', { id: '694252ab61c46255e1711cac' });
    expect(text).toContain('This decision has no zone markup; showing the full text.');
  });

  it('a Bulletin decision without zones gets the same note, with no claim about why', async () => {
    const { text } = await call('judilibre_get_decision', { id: '607976659ba5988459c49f42' });
    expect(text).toContain('Publié au Bulletin');
    expect(text).toContain('This decision has no zone markup; showing the full text.');
    expect(text).not.toContain('unpublished');
  });

  it('a court of appeal decision with zone moyens: the decision has zones, just not that one', async () => {
    const { text } = await call('judilibre_get_decision', {
      id: '6aead2477a1020213711b3db',
      zone: 'moyens',
    });
    expect(text).toContain('This decision has no "moyens" zone; showing the full text.');
    expect(text).toMatch(/^Zones: /m);
    expect(text).not.toContain('no zone markup');
  });

  it('the same Bulletin decision with zone motivations: one note, then the full text', async () => {
    const { text } = await call('judilibre_get_decision', {
      id: '607976659ba5988459c49f42',
      zone: 'motivations',
    });
    expect(text).toContain(
      'This decision has no zone markup, so no "motivations" zone; showing the full text.',
    );
    expect(count(text, 'showing the full text')).toBe(1);
    expect(text).toContain('── Full text ──');
  });

  it('unknown id', async () => {
    const { result, text } = await call('judilibre_get_decision', {
      id: '000000000000000000000000',
    });
    expect(result.isError).toBeFalsy();
    expect(text).toContain('No Judilibre decision with id "000000000000000000000000".');
    expect(text).toContain('judilibre_search_decisions');
  });

  it('a 100 000-character text: every page fits, has the source line, and offsets rebuild the text', async () => {
    const id = 'aaaaaaaaaaaaaaaaaaaaaaaa';
    const text = Array.from({ length: 100_000 / 10 }, (_, i) => `w${String(i).padStart(8, '0')}`)
      .join(' ')
      .slice(0, 100_000);
    const fake = fakeJudilibre({ decisions: { [id]: decisionOf({ id, text }) } });
    const client = await connect({
      config: sandboxConfig(),
      getStatus: () => Promise.reject(new Error('not used')),
      sources: [
        createJudilibreSource({
          searchDecisions: createSearchJudilibre(fake.repo),
          getDecision: createGetJudilibreDecision(fake.repo),
          listTaxonomy: createListJudilibreTaxonomy(fake.repo),
        }),
      ],
    });
    let rebuilt = '';
    let offset = 0;
    for (let guard = 0; guard < 10; guard++) {
      const page = firstText(
        await client.callTool({ name: 'judilibre_get_decision', arguments: { id, offset } }),
      );
      expect(page.length).toBeLessThanOrEqual(MAX_TOOL_TEXT);
      expect(page).toContain(`Source: Judilibre · https://www.courdecassation.fr/decision/${id}`);
      const start = page.indexOf('── Full text ──\n') + '── Full text ──\n'.length;
      const next = /\[Truncated — call again with "offset": (\d+)\]/.exec(page);
      const end = next ? page.lastIndexOf('\n[Truncated') : page.length;
      rebuilt += page.slice(start, end).replace(/\nSame decision on Légifrance[^\n]*$/, '');
      if (!next) break;
      offset = Number(next[1]);
    }
    expect(rebuilt.trim()).toBe(text.trim());
  });
});

describe('judilibre_list_taxonomy', () => {
  it('chamber list', async () => {
    const { text } = await call('judilibre_list_taxonomy', { list: 'chamber' });
    expect(text).toContain('soc — Chambre sociale');
  });

  it('chamber for the courts of appeal is free text', async () => {
    const { text } = await call('judilibre_list_taxonomy', { list: 'chamber', jurisdiction: 'ca' });
    expect(text).toContain('free text');
    expect(text).toContain('put the words in "query" instead');
  });
});

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

describe('search header criteria', () => {
  it('prints the source labels of the filters, not the input keys', async () => {
    const { text } = await call('judilibre_search_decisions', {
      query: 'forfait jours',
      ...LABELLED_FILTERS,
    });
    const header = text.split('\n')[0] ?? '';
    for (const label of LABELS) expect(header).toContain(label);
    expect(header).not.toContain('chamber social');
    expect(header).toContain('all words');
  });

  it('a zero-hit answer lists the same labelled criteria', async () => {
    const { text } = await call('judilibre_search_decisions', {
      query: 'licenciement',
      ...LABELLED_FILTERS,
    });
    expect(text).toContain('No Judilibre decision matches');
    for (const label of LABELS) expect(text).toContain(label);
  });

  it('any_word reads "any word" in the header', async () => {
    const { text } = await call('judilibre_search_decisions', {
      query: 'forfait jours',
      match: 'any_word',
    });
    expect(text.split('\n')[0]).toContain('any word');
  });

  it('a relaxed search says so', async () => {
    const fake = fakeJudilibre({ hits: [hitOf(1)] });
    const repo: JudilibreRepository = {
      ...fake.repo,
      search: async (q, ctx) => ({ ...(await fake.repo.search(q, ctx)), relaxed: true }),
    };
    const client = await serverOver(repo);
    const text = firstText(
      await client.callTool({ name: 'judilibre_search_decisions', arguments: { query: 'x y' } }),
    );
    expect(text).toContain(
      'Judilibre found no exact match and loosened the search: these results match only some of the words.',
    );
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

describe('search paging and hints', () => {
  const search = async (hits: JudilibreHit[], total: number, args: Record<string, unknown>) => {
    const client = await serverOver(fakeJudilibre({ hits, total }).repo);
    return firstText(
      await client.callTool({
        name: 'judilibre_search_decisions',
        arguments: { query: 'x', ...args },
      }),
    );
  };

  it('a page past the end says so instead of "no decision matches"', async () => {
    const { text } = await call('judilibre_search_decisions', { query: '24-16.924', page: 6 });
    expect(text).not.toContain('No Judilibre decision matches');
    expect(text).toContain('1 decision matches');
    expect(text).toContain('Page 6 is past the last page (1).');
  });

  it('a single hit reads "1 decision matches"', async () => {
    expect(await search([hitOf(1)], 1, {})).toContain('1 decision matches');
  });

  it('a total above 10 000 says only the first 10 000 are reachable', async () => {
    const text = await search([hitOf(1)], 12_000, {});
    expect(text).toContain('12000 decisions match');
    expect(text).toContain(
      'Only the first 10 000 are reachable by paging; narrow the search to see the others.',
    );
    expect(await search([hitOf(1)], 9_999, {})).not.toContain('reachable by paging');
  });

  it('the zero-hit hint names the other sources and makes no unverified claim', async () => {
    const text = await search([], 0, {});
    expect(text).toContain(
      "legifrance_search_case_law (Conseil d'État, Conseil constitutionnel, CNIL, financial courts, older Cour de cassation decisions)",
    );
    expect(text).not.toContain('for older decisions');
    expect(text).toContain('"match": "any_word"');
  });

  it('the zero-hit hint does not suggest any_word when it is already used', async () => {
    const text = await search([], 0, { match: 'any_word' });
    expect(text).not.toContain('"match": "any_word"');
    expect(text).toContain('fewer filters');
  });
});

describe('a decision page with a very long head', () => {
  const id = 'cccccccccccccccccccccccc';
  const long = (n: number, c: string) => Array.from({ length: n }, () => c.repeat(500));

  it('keeps room for the text, stays within the cap and gives a valid continuation offset', async () => {
    const decision = decisionOf({
      id,
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
    const client = await serverOver(fakeJudilibre({ decisions: { [id]: decision } }).repo);
    const text = firstText(
      await client.callTool({ name: 'judilibre_get_decision', arguments: { id } }),
    );
    expect(text.length).toBeLessThanOrEqual(MAX_TOOL_TEXT);
    expect(text).toContain('texte texte');
    expect(text).toMatch(/more\)/);
    const next = /"offset": (\d+)/.exec(text);
    expect(Number(next?.[1])).toBeGreaterThanOrEqual(2_000);
  });
});

describe('court identity', () => {
  it('an unknown location key (a tribunal judiciaire) prints as is, after the jurisdiction', async () => {
    const hit: JudilibreHit = {
      ...hitOf(1),
      jurisdiction: { key: 'tj', label: 'Tribunal judiciaire' },
      chamber: null,
      location: { key: 'tj75056', label: 'tj75056' },
    };
    const client = await serverOver(fakeJudilibre({ hits: [hit] }).repo);
    const text = firstText(
      await client.callTool({
        name: 'judilibre_search_decisions',
        arguments: { query: 'x', jurisdiction: 'tj' },
      }),
    );
    expect(text).toContain('1. Tribunal judiciaire, tj75056 — decision of');
  });
});

describe('page size cap', () => {
  it('a 20-hit page with long summaries and excerpts stays within the cap', async () => {
    const hits = Array.from({ length: 20 }, (_, i) => hitOf(i + 1));
    const client = await serverOver(fakeJudilibre({ hits, total: 20 }).repo);
    const text = firstText(
      await client.callTool({
        name: 'judilibre_search_decisions',
        arguments: { query: 'x', page_size: 20 },
      }),
    );
    expect(text.length).toBeLessThanOrEqual(MAX_TOOL_TEXT);
    expect(count(text, 'Source: Judilibre · ')).toBe(count(text, 'Full text: '));
  });
});

describe('judilibre_get_decision truncation is visible', () => {
  const id = 'bbbbbbbbbbbbbbbbbbbbbbbb';
  async function read(over: Parameters<typeof decisionOf>[0]) {
    const client = await serverOver(
      fakeJudilibre({ decisions: { [id]: decisionOf({ id, text: 'texte', ...over }) } }).repo,
    );
    return firstText(await client.callTool({ name: 'judilibre_get_decision', arguments: { id } }));
  }

  it('visa: 30 items shown, "(+N more)" after the cut, "…" on a cut item', async () => {
    const text = await read({ visa: Array.from({ length: 35 }, () => 'V'.repeat(600)) });
    expect(text).toContain('(+5 more)');
    expect(text).toContain(`${'V'.repeat(499)}…`);
    expect(count(text, '- VVV')).toBe(30);
  });

  it('rapprochements: "(+N more)"', async () => {
    const text = await read({ rapprochements: Array.from({ length: 32 }, (_, i) => `R${i}`) });
    expect(text).toContain('(+2 more)');
  });

  it('files: "(+N more)"', async () => {
    const files = Array.from({ length: 31 }, (_, i) => ({
      name: `f${i}`,
      type: 'pdf',
      url: `u${i}`,
    }));
    expect(await read({ files })).toContain('(+1 more)');
  });

  it('summary: a cut summary ends with "…"', async () => {
    const text = await read({ titles: ['T'.repeat(3000)] });
    expect(text).toContain(`Titles: ${'T'.repeat(1999)}…`);
  });

  it('a list within the limit has no "more" marker', async () => {
    expect(await read({ visa: ['a', 'b'] })).not.toContain('more)');
  });
});
