import { describe, expect, it } from 'vitest';
import {
  createGetJudilibreDecision,
  createListJudilibreTaxonomy,
  createSearchJudilibre,
} from '../../../src/services/case-law/judilibre.js';
import { decisionOf, fakeJudilibre } from '../../helpers/fake-case-law.js';

const rejects = async (p: Promise<unknown>, message: string) => {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toMatchObject({ kind: 'invalid_input', message });
};

describe('createSearchJudilibre', () => {
  it('maps match, chamber, sort and the 1-based page to the wire query', async () => {
    const { repo, calls } = fakeJudilibre({ total: 568 });
    const view = await createSearchJudilibre(repo)({
      query: ' forfait jours ',
      match: 'exact_phrase',
      chamber: 'social',
      sort: 'newest',
    });
    expect(calls.search[0]?.query).toEqual({
      query: 'forfait jours',
      operator: 'exact',
      jurisdiction: 'cc',
      chamber: 'social',
      page: 0,
      pageSize: 10,
      sort: 'newest',
    });
    expect(view.input).toMatchObject({
      match: 'exact_phrase',
      jurisdiction: 'cc',
      sort: 'newest',
      page: 1,
      pageSize: 10,
    });
    expect(view.pageCount).toBe(57);
  });

  it('defaults to all_words / relevance and sends page 2 as wire page 1', async () => {
    const { repo, calls } = fakeJudilibre();
    const view = await createSearchJudilibre(repo)({ query: 'a', match: 'any_word', page: 2 });
    expect(calls.search[0]?.query).toMatchObject({ operator: 'or', page: 1, sort: 'relevance' });
    expect(view.result.page).toBe(2);
    const dflt = fakeJudilibre();
    await createSearchJudilibre(dflt.repo)({ query: 'a' });
    expect(dflt.calls.search[0]?.query.operator).toBe('and');
  });

  it('maps publication letters and forwards the other filters', async () => {
    const pubs = { bulletin: 'b', report: 'r', chamber_letter: 'l', press_release: 'c' } as const;
    for (const [publication, wire] of Object.entries(pubs)) {
      const { repo, calls } = fakeJudilibre();
      await createSearchJudilibre(repo)({
        query: 'a',
        publication: publication as keyof typeof pubs,
        solution: 'rejet',
        formation: 'fp',
        searchIn: 'summary',
        dateFrom: '2024-01-01',
        dateTo: '2024-12-31',
      });
      expect(calls.search[0]?.query).toMatchObject({
        publication: wire,
        solution: 'rejet',
        formation: 'fp',
        field: 'summary',
        dateFrom: '2024-01-01',
        dateTo: '2024-12-31',
      });
    }
  });

  it('caps pageCount at the 10 000 result window', async () => {
    const { repo } = fakeJudilibre({ total: 39826 });
    const view = await createSearchJudilibre(repo)({ query: 'a', pageSize: 20 });
    expect(view.pageCount).toBe(500);
  });

  it('rejects a blank query', async () => {
    const { repo, calls } = fakeJudilibre();
    await rejects(
      createSearchJudilibre(repo)({ query: '  ' }),
      '"query" is required: Judilibre finds nothing without search words. To look up a decision, use its pourvoi number or ECLI as the query.',
    );
    expect(calls.search).toHaveLength(0);
  });

  it('rejects a query over 512 characters', async () => {
    const { repo } = fakeJudilibre();
    await rejects(
      createSearchJudilibre(repo)({ query: 'x'.repeat(513) }),
      '"query" is limited to 512 characters.',
    );
    await createSearchJudilibre(repo)({ query: 'x'.repeat(512) });
  });

  it('rejects cc-only filters for other jurisdictions', async () => {
    const { repo } = fakeJudilibre();
    const msg =
      '"chamber", "formation", "publication" and "solution" filter Cour de cassation decisions only (jurisdiction "cc"). For other courts, put the chamber or outcome words in "query".';
    for (const f of [
      { chamber: 'social' },
      { formation: 'fp' },
      { publication: 'bulletin' },
      { solution: 'rejet' },
    ] as const) {
      await rejects(createSearchJudilibre(repo)({ query: 'a', jurisdiction: 'ca', ...f }), msg);
    }
  });

  it('rejects location with cc but accepts it for ca', async () => {
    const { repo, calls } = fakeJudilibre();
    await rejects(
      createSearchJudilibre(repo)({ query: 'a', location: 'ca_paris' }),
      '"location" applies to courts of appeal and first-instance courts (jurisdiction ca, tj, tcom or cph).',
    );
    await createSearchJudilibre(repo)({ query: 'a', jurisdiction: 'ca', location: 'ca_paris' });
    expect(calls.search[0]?.query.location).toBe('ca_paris');
  });

  it('rejects a window beyond 10 000 results', async () => {
    const { repo } = fakeJudilibre();
    const msg =
      'Judilibre returns at most the first 10 000 results; narrow the search (dates, chamber, more precise words).';
    await rejects(createSearchJudilibre(repo)({ query: 'a', page: 501, pageSize: 20 }), msg);
    await createSearchJudilibre(repo)({ query: 'a', page: 500, pageSize: 20 });
  });

  it('rejects an inverted date range and malformed dates', async () => {
    const { repo } = fakeJudilibre();
    await rejects(
      createSearchJudilibre(repo)({ query: 'a', dateFrom: '2024-02-01', dateTo: '2024-01-01' }),
      '"date_from" must not be after "date_to".',
    );
    await expect(
      createSearchJudilibre(repo)({ query: 'a', dateFrom: '2024-13-01' }),
    ).rejects.toMatchObject({ kind: 'invalid_input' });
  });

  it('rejects out-of-range page and page size', async () => {
    const { repo } = fakeJudilibre();
    for (const bad of [{ page: 0 }, { pageSize: 0 }, { pageSize: 21 }, { page: 1.5 }]) {
      await expect(createSearchJudilibre(repo)({ query: 'a', ...bad })).rejects.toMatchObject({
        kind: 'invalid_input',
      });
    }
  });
});

describe('createGetJudilibreDecision', () => {
  const ID = '6a0e9ff1cdc6046d47668703';
  const text = 'INTRO. MOTIF A. entre. MOTIF B. fin';
  const at = (s: string) => ({ start: text.indexOf(s), end: text.indexOf(s) + s.length });
  const decision = decisionOf({
    id: ID,
    text,
    zones: [
      { zone: 'introduction', ...at('INTRO.') },
      { zone: 'motivations', ...at('MOTIF A.') },
      { zone: 'motivations', ...at('MOTIF B.') },
    ],
  });

  it('rejects ids that are not 24 hex characters', async () => {
    const { repo, calls } = fakeJudilibre();
    await rejects(
      createGetJudilibreDecision(repo)({ id: 'JURITEXT000049000000' }),
      '"JURITEXT000049000000" is not a Judilibre decision id (24 hexadecimal characters). Légifrance ids (JURITEXT…, CETATEXT…) go to legifrance_get_decision.',
    );
    expect(calls.getDecision).toHaveLength(0);
  });

  it('returns not_found when the repository has no such decision', async () => {
    const { repo } = fakeJudilibre();
    expect(await createGetJudilibreDecision(repo)({ id: ID })).toEqual({
      kind: 'not_found',
      id: ID,
    });
  });

  it('returns the decision without a zone by default', async () => {
    const { repo } = fakeJudilibre({ decisions: { [ID]: decision } });
    expect(await createGetJudilibreDecision(repo)({ id: ID })).toEqual({
      kind: 'found',
      decision,
      zone: null,
      zoneMissing: null,
    });
  });

  it('joins the segments of a split zone with a marker', async () => {
    const { repo } = fakeJudilibre({ decisions: { [ID]: decision } });
    const res = await createGetJudilibreDecision(repo)({ id: ID, zone: 'motivations' });
    expect(res).toMatchObject({
      kind: 'found',
      zone: { name: 'motivations', text: 'MOTIF A.\n[…]\nMOTIF B.' },
      zoneMissing: null,
    });
  });

  it('reports a zone the decision has no segment for', async () => {
    const { repo } = fakeJudilibre({ decisions: { [ID]: decision } });
    const res = await createGetJudilibreDecision(repo)({ id: ID, zone: 'annexes' });
    expect(res).toMatchObject({ kind: 'found', zone: null, zoneMissing: 'annexes' });
  });
});

describe('createListJudilibreTaxonomy', () => {
  const entries = [
    { key: 'soc', label: 'Chambre sociale', group: null },
    { key: 'a', label: 'Mise en exécution', group: 'Pénal' },
    { key: 'b', label: 'Rejet', group: 'Exécution provisoire' },
    { key: 'c', label: 'Cassation', group: null },
  ];

  it('lists entries, defaulting the jurisdiction to cc', async () => {
    const { repo, calls } = fakeJudilibre({ taxonomies: { chamber: entries } });
    const res = await createListJudilibreTaxonomy(repo)({ list: 'chamber' });
    expect(res).toEqual({
      kind: 'list',
      list: 'chamber',
      jurisdiction: 'cc',
      entries,
      total: 4,
      contains: null,
    });
    expect(calls.taxonomy).toEqual([{ id: 'chamber', context: 'cc' }]);
  });

  it('filters by folded substring on label and group', async () => {
    const { repo } = fakeJudilibre({ taxonomies: { solution: entries } });
    const res = await createListJudilibreTaxonomy(repo)({
      list: 'solution',
      contains: 'execution',
    });
    expect(res).toMatchObject({ kind: 'list', total: 4, contains: 'execution' });
    expect(res.kind === 'list' && res.entries.map((e) => e.key)).toEqual(['a', 'b']);
  });

  it('treats a blank contains as no filter', async () => {
    const { repo } = fakeJudilibre({ taxonomies: { solution: entries } });
    const res = await createListJudilibreTaxonomy(repo)({ list: 'solution', contains: ' ' });
    expect(res).toMatchObject({ kind: 'list', contains: null });
  });

  it('answers free_text without calling the repository for non-cc cc-only lists', async () => {
    const { repo, calls } = fakeJudilibre();
    for (const list of ['chamber', 'formation', 'publication', 'solution'] as const) {
      expect(await createListJudilibreTaxonomy(repo)({ list, jurisdiction: 'ca' })).toEqual({
        kind: 'free_text',
        list,
        jurisdiction: 'ca',
      });
    }
    expect(calls.taxonomy).toHaveLength(0);
    await createListJudilibreTaxonomy(repo)({ list: 'location', jurisdiction: 'ca' });
    expect(calls.taxonomy).toHaveLength(1);
  });
});
