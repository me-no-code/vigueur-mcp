import { describe, expect, it } from 'vitest';
import {
  CASE_LAW_COLLECTION_LABELS,
  createGetLegifranceDecision,
  createSearchCaseLaw,
  LEGIFRANCE_CASE_LAW_COVERAGE_NOTE,
} from '../../../src/services/case-law/legifrance.js';
import type { LegifranceDecision } from '../../../src/services/case-law/ports.js';
import { fakeLegifrance } from '../../helpers/fake-case-law.js';

const rejects = async (p: Promise<unknown>, message: string) => {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toMatchObject({ kind: 'invalid_input', message });
};

describe('LEGIFRANCE_CASE_LAW_COVERAGE_NOTE', () => {
  it('is the exact coverage note', () => {
    expect(LEGIFRANCE_CASE_LAW_COVERAGE_NOTE).toBe(
      'Note: Légifrance does not hold every Cour de cassation decision (in particular not its unreasoned rejections and non-admissions, formation restreinte RNSM/NA), receives the ones it holds weeks after Judilibre, and holds no appeal-court decisions after early 2023. Judilibre (judilibre_search_decisions) holds those decisions.',
    );
  });
});

describe('CASE_LAW_COLLECTION_LABELS', () => {
  it('labels the five collections', () => {
    expect(CASE_LAW_COLLECTION_LABELS).toEqual({
      judicial: 'judicial courts (JURI)',
      administrative: 'administrative courts (CETAT)',
      constitutional: 'Conseil constitutionnel (CONSTIT)',
      cnil: 'CNIL',
      financial: 'financial courts (JUFI)',
    });
  });
});

describe('createSearchCaseLaw', () => {
  it('maps the input to the wire query and defaults', async () => {
    const { repo, calls } = fakeLegifrance({ total: 45 });
    const view = await createSearchCaseLaw(repo)({
      collection: 'judicial',
      query: ' forfait jours ',
      court: 'cassation',
      chamber: 'social',
      publication: 'published',
      dateFrom: '2025-01-01',
      dateTo: '2025-12-31',
    });
    expect(calls.search[0]?.query).toEqual({
      collection: 'judicial',
      text: 'forfait jours',
      court: 'cassation',
      chamber: 'social',
      publication: 'published',
      dateFrom: '2025-01-01',
      dateTo: '2025-12-31',
      sort: 'relevance',
      page: 1,
      pageSize: 10,
    });
    expect(view.pageCount).toBe(5);
    expect(view.query.sort).toBe('relevance');
  });

  it('sorts by newest when no query, number or ECLI is given', async () => {
    const { repo, calls } = fakeLegifrance();
    await createSearchCaseLaw(repo)({ collection: 'administrative' });
    expect(calls.search[0]?.query.sort).toBe('newest');
  });

  it('sorts by relevance for a number or an ECLI, and honours an explicit sort', async () => {
    const { repo, calls } = fakeLegifrance();
    const search = createSearchCaseLaw(repo);
    await search({ collection: 'judicial', number: '24-16.924' });
    await search({ collection: 'judicial', ecli: 'ECLI:FR:CCASS:2025:SO01200' });
    await search({ collection: 'judicial', query: 'x', sort: 'newest' });
    expect(calls.search.map((c) => c.query.sort)).toEqual(['relevance', 'relevance', 'newest']);
  });

  it('normalises the case number before the repository', async () => {
    const { repo, calls } = fakeLegifrance();
    await createSearchCaseLaw(repo)({ collection: 'judicial', number: 'n° S 24-16.924' });
    expect(calls.search[0]?.query.number).toBe('24-16.924');
  });

  it('normalises the ECLI', async () => {
    const { repo, calls } = fakeLegifrance();
    await createSearchCaseLaw(repo)({
      collection: 'administrative',
      ecli: ' ecli:fr:cecha:2024:123456.20240101 ',
    });
    expect(calls.search[0]?.query.ecli).toBe('ECLI:FR:CECHA:2024:123456.20240101');
  });

  it('rejects an ECLI outside the judicial and administrative collections', async () => {
    const { repo, calls } = fakeLegifrance();
    await rejects(
      createSearchCaseLaw(repo)({
        collection: 'constitutional',
        ecli: 'ECLI:FR:CCASS:2025:SO01200',
      }),
      '"ecli" works for the judicial and administrative collections. For the Conseil constitutionnel, use "number" (e.g. "2026-1217/1218").',
    );
    expect(calls.search).toHaveLength(0);
  });

  it('rejects a malformed ECLI', async () => {
    const { repo } = fakeLegifrance();
    await rejects(
      createSearchCaseLaw(repo)({ collection: 'judicial', ecli: 'nope' }),
      '"nope" is not an ECLI (e.g. ECLI:FR:CCASS:2025:SO01200).',
    );
  });

  it('rejects court and chamber outside the judicial collection', async () => {
    const { repo } = fakeLegifrance();
    const search = createSearchCaseLaw(repo);
    const msg = '"court" and "chamber" apply to the judicial collection only.';
    await rejects(search({ collection: 'administrative', court: 'appeal' }), msg);
    await rejects(search({ collection: 'cnil', chamber: 'social' }), msg);
  });

  it('rejects a chamber with a court other than cassation', async () => {
    const { repo } = fakeLegifrance();
    await rejects(
      createSearchCaseLaw(repo)({ collection: 'judicial', court: 'appeal', chamber: 'social' }),
      '"chamber" applies to Cour de cassation decisions (court "cassation").',
    );
  });

  it('rejects a publication filter where the collection has none', async () => {
    const { repo } = fakeLegifrance();
    const search = createSearchCaseLaw(repo);
    await rejects(
      search({ collection: 'constitutional', publication: 'published' }),
      '"publication" is not available for the Conseil constitutionnel (CONSTIT) collection.',
    );
    await rejects(
      search({ collection: 'cnil', publication: 'unpublished' }),
      '"publication" is not available for the CNIL collection.',
    );
  });

  it('allows publication for the judicial, administrative and financial collections', async () => {
    const { repo, calls } = fakeLegifrance();
    const search = createSearchCaseLaw(repo);
    for (const collection of ['judicial', 'administrative', 'financial'] as const) {
      await search({ collection, publication: 'published' });
    }
    expect(calls.search).toHaveLength(3);
  });

  it('applies the date-range rule', async () => {
    const { repo } = fakeLegifrance();
    const search = createSearchCaseLaw(repo);
    await rejects(
      search({ collection: 'judicial', dateFrom: '2025-02-01', dateTo: '2025-01-01' }),
      '"date_from" must not be after "date_to".',
    );
    await expect(search({ collection: 'judicial', dateFrom: '2025-02-30' })).rejects.toMatchObject({
      kind: 'invalid_input',
    });
  });

  it('guards page and page size', async () => {
    const { repo } = fakeLegifrance();
    const search = createSearchCaseLaw(repo);
    await rejects(
      search({ collection: 'judicial', page: 0 }),
      '"page" must be a whole number, 1 or more.',
    );
    await rejects(
      search({ collection: 'judicial', pageSize: 21 }),
      '"page_size" must be a whole number from 1 to 20.',
    );
    await rejects(
      search({ collection: 'judicial', pageSize: 0 }),
      '"page_size" must be a whole number from 1 to 20.',
    );
  });
});

describe('createGetLegifranceDecision', () => {
  const decision: LegifranceDecision = {
    id: 'JURITEXT000049987654',
    collection: 'judicial',
    title: 't',
    court: null,
    chamber: null,
    nature: null,
    decisionDate: '2025-01-01',
    numbers: [],
    ecli: null,
    solution: null,
    publication: null,
    summary: null,
    attacked: null,
    text: 'x',
    constitutionalCouncilUrl: null,
    joUrl: null,
    labelledStatus: null,
    publishedOn: null,
  };

  it('returns a found decision', async () => {
    const { repo, calls } = fakeLegifrance({ decisions: { [decision.id]: decision } });
    const out = await createGetLegifranceDecision(repo)({ id: ` ${decision.id} ` });
    expect(out).toEqual({ kind: 'found', decision });
    expect(calls.getDecision).toEqual([decision.id]);
  });

  it('returns not_found when the repository has none', async () => {
    const { repo } = fakeLegifrance();
    expect(await createGetLegifranceDecision(repo)({ id: 'CETATEXT000012345678' })).toEqual({
      kind: 'not_found',
      id: 'CETATEXT000012345678',
    });
  });

  it('points a Judilibre id to judilibre_get_decision', async () => {
    const { repo, calls } = fakeLegifrance();
    await rejects(
      createGetLegifranceDecision(repo)({ id: '694252ab61c46255e1711cac' }),
      '"694252ab61c46255e1711cac" is not a Légifrance decision id (JURITEXT…, CETATEXT…, CONSTEXT…, CNILTEXT…, JUFITEXT… + 12 digits). Judilibre ids (24 hexadecimal characters) go to judilibre_get_decision.',
    );
    expect(calls.getDecision).toHaveLength(0);
  });

  it('accepts the five id prefixes only with 12 digits', async () => {
    const { repo } = fakeLegifrance();
    const get = createGetLegifranceDecision(repo);
    for (const p of ['JURI', 'CETA', 'CONS', 'CNIL', 'JUFI']) {
      expect((await get({ id: `${p}TEXT000012345678` })).kind).toBe('not_found');
    }
    await expect(get({ id: 'JURITEXT00001234567' })).rejects.toMatchObject({
      kind: 'invalid_input',
    });
  });
});
