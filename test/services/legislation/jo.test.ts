import { describe, expect, it } from 'vitest';
import { createLatestJo, createListReferenceValues } from '../../../src/services/legislation/jo.js';
import type { JoIssue, JoText } from '../../../src/services/legislation/ports.js';
import { fakeLegislation } from '../../helpers/fake-legislation.js';

const today = () => '2026-11-12';

const text = (id: string, nature: string | null, ministry: string | null, emitter: string | null) =>
  ({ id, title: `Texte ${id}`, nature, ministry, emitter }) satisfies JoText;

const issue = (id: string, groups: JoIssue['groups']): JoIssue => ({
  id,
  title: `JORF ${id}`,
  number: '1',
  publishedOn: '2026-11-11',
  eliPath: '/eli/jo/2026/11/11/0264',
  groups,
});

const TRAVAIL_A = 'Ministère du travail et des solidarités';
const TRAVAIL_B = 'Ministère du travail, de la santé et des familles';
const SAMPLE = issue('JORFCONT1', [
  {
    path: ['Lois'],
    texts: [text('T1', 'LOI', null, 'Parlement')],
  },
  {
    path: ['Décrets'],
    texts: [
      text('T2', 'DECRET', TRAVAIL_A, 'Premier ministre'),
      text('T3', 'DECRET', TRAVAIL_B, null),
      text('T4', 'ARRETE', 'Ministère de la justice', null),
    ],
  },
  { path: ['Avis'], texts: [text('T5', 'AVIS', null, null)] },
]);

const seeded = () =>
  fakeLegislation({
    overrides: {
      async latestJo() {
        return [structuredClone(SAMPLE)];
      },
    },
  });

describe('createLatestJo', () => {
  it('reads one issue by default', async () => {
    const { repo, calls } = seeded();
    const view = await createLatestJo(repo, { today })({});
    expect(calls.latestJo[0]?.args).toEqual([1]);
    expect(view.issues).toHaveLength(1);
    expect(view.totalTexts).toBe(5);
    expect(view.filter).toEqual({ nature: null, emitter: null, matchedEmitters: [] });
  });

  it('rejects a count outside 1-10', async () => {
    const { repo } = seeded();
    const run = createLatestJo(repo, { today });
    await expect(run({ count: 0 })).rejects.toMatchObject({ kind: 'invalid_input' });
    await expect(run({ count: 11 })).rejects.toMatchObject({ kind: 'invalid_input' });
  });

  it('with a date lists the day then reads each issue (max 3)', async () => {
    const listed = ['A', 'B', 'C', 'D'].map((id) => ({ ...issue(id, null), groups: null }));
    const { repo, calls } = fakeLegislation({
      overrides: {
        async joIssuesBetween() {
          return listed;
        },
        async joIssue(id) {
          return id === 'B' ? null : issue(id, [{ path: [], texts: [text(id, 'LOI', null, 'X')] }]);
        },
      },
    });
    const view = await createLatestJo(repo, { today })({ date: '2026-11-11' });
    expect(calls.joIssuesBetween[0]?.args).toEqual(['2026-11-11', '2026-11-11']);
    expect(calls.joIssue.map((c) => c.args[0])).toEqual(['A', 'B', 'C']);
    expect(calls.latestJo).toHaveLength(0);
    expect(view.issues.map((i) => i.id)).toEqual(['A', 'C']);
  });

  it('filters by nature, accent- and case-insensitively', async () => {
    const { repo } = seeded();
    const run = createLatestJo(repo, { today });
    const view = await run({ nature: 'décret' });
    expect(view.totalTexts).toBe(2);
    expect(view.issues[0]?.groups?.map((g) => g.path)).toEqual([['Décrets']]);
    expect((await run({ nature: 'decret' })).totalTexts).toBe(2);
  });

  it('emitter travail matches both spellings and lists them', async () => {
    const { repo } = seeded();
    const view = await createLatestJo(repo, { today })({ emitter: 'Travail' });
    expect(view.totalTexts).toBe(2);
    expect([...view.filter.matchedEmitters].sort()).toEqual([TRAVAIL_A, TRAVAIL_B].sort());
  });

  it('emitter also matches the emitter field', async () => {
    const { repo } = seeded();
    const view = await createLatestJo(repo, { today })({ emitter: 'parlement' });
    expect(view.totalTexts).toBe(1);
    expect(view.filter.matchedEmitters).toEqual(['Parlement']);
  });

  it('no match keeps the issues with empty groups and lists what exists (before filtering)', async () => {
    const { repo } = seeded();
    const view = await createLatestJo(repo, { today })({ nature: 'decret', emitter: 'defense' });
    expect(view.issues).toHaveLength(1);
    expect(view.issues[0]?.id).toBe('JORFCONT1');
    expect(view.issues[0]?.groups).toEqual([]);
    expect(view.totalTexts).toBe(0);
    expect(view.filter.matchedEmitters).toEqual([]);
    // Before filtering, most frequent first (ties alphabetical); ministry wins over emitter.
    expect(view.available.natures).toEqual(['DECRET', 'ARRETE', 'AVIS', 'LOI']);
    expect(view.available.emitters).toEqual(
      [TRAVAIL_A, TRAVAIL_B, 'Ministère de la justice', 'Parlement'].sort((a, b) =>
        a.localeCompare(b, 'fr'),
      ),
    );
  });
});

describe('createListReferenceValues', () => {
  it('codes come from listCodes with id and status, sorted by title', async () => {
    const { repo, calls } = fakeLegislation();
    const view = await createListReferenceValues(repo, { today })({ kind: 'codes' });
    expect(calls.jorfFacets).toHaveLength(0);
    expect(view.since).toBeNull();
    expect(view.values[0]).toEqual({
      value: 'Code civil',
      count: null,
      id: 'LEGITEXT000006070721',
      status: 'in_force',
    });
    const titles = view.values.map((v) => v.value);
    expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b, 'fr')));
  });

  it('natures and emitters use the facets; default since is today minus 365 days', async () => {
    const { repo, calls } = fakeLegislation({
      overrides: {
        async jorfFacets() {
          return {
            natures: [{ value: 'ARRETE', count: 90 }],
            emitters: [{ value: 'Premier ministre', count: 12 }],
          };
        },
      },
    });
    const run = createListReferenceValues(repo, { today });
    const natures = await run({ kind: 'jorf_natures' });
    expect(calls.jorfFacets[0]?.args).toEqual(['2025-11-12', '2026-11-12']);
    expect(natures).toEqual({
      kind: 'jorf_natures',
      since: '2025-11-12',
      values: [{ value: 'ARRETE', count: 90, id: null, status: null }],
    });
    const emitters = await run({ kind: 'jorf_emitters', since: '2026-01-01' });
    expect(calls.jorfFacets[1]?.args).toEqual(['2026-01-01', '2026-11-12']);
    expect(emitters.values[0]?.value).toBe('Premier ministre');
  });

  it('rejects a bad or future since', async () => {
    const { repo } = fakeLegislation();
    const run = createListReferenceValues(repo, { today });
    await expect(run({ kind: 'jorf_natures', since: '2026-02-30' })).rejects.toMatchObject({
      kind: 'invalid_input',
    });
    await expect(run({ kind: 'jorf_natures', since: '2027-01-01' })).rejects.toMatchObject({
      kind: 'invalid_input',
    });
  });
});
