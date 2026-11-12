import { describe, expect, it } from 'vitest';
import { createListChanges } from '../../../src/services/legislation/changes.js';
import type { ChangeEntry } from '../../../src/services/legislation/ports.js';
import { fakeLegislation } from '../../helpers/fake-legislation.js';

const today = () => '2026-11-12';
const entry = (date: string, amendingTitle: string, articleNum: string | null): ChangeEntry => ({
  date,
  action: 'modification',
  articleNum,
  articleId: null,
  sectionTitle: null,
  amendingTitle,
  amendingArticleId: null,
});

describe('createListChanges', () => {
  it('groups by amending text, ordered by first date, and counts scheduled entries', async () => {
    const { repo, calls } = fakeLegislation({
      overrides: {
        async listChanges() {
          return {
            entries: [
              entry('2026-12-01', 'Loi B', 'L2'),
              entry('2026-03-01', 'Loi A', 'L9'),
              entry('2026-03-01', 'Loi A', 'L1'),
              entry('2026-01-15', 'Loi B', 'L5'),
              entry('2026-02-01', 'Loi C', null),
            ],
            undeterminedCount: 2,
            detailMissingYears: ['2025'],
          };
        },
      },
    });
    const res = await createListChanges(repo, { today })({
      code: 'Code du travail',
      since: '2026-01-01',
    });
    expect(calls.listChanges[0]?.args).toEqual([
      'LEGITEXT000006072050',
      '2026-01-01',
      '2026-11-12',
    ]);
    expect(res).toMatchObject({
      textTitle: 'Code du travail',
      textId: 'LEGITEXT000006072050',
      since: '2026-01-01',
      until: '2026-11-12',
      scheduledCount: 1,
      undeterminedCount: 2,
      detailMissingYears: ['2025'],
      totalEntries: 5,
    });
    expect(res.groups.map((g) => g.amendingTitle)).toEqual(['Loi B', 'Loi C', 'Loi A']);
    expect(res.groups[0]?.entries.map((e) => e.articleNum)).toEqual(['L5', 'L2']);
    expect(res.groups[2]?.entries.map((e) => e.articleNum)).toEqual(['L1', 'L9']);
  });

  it('rejects until before since and bad dates', async () => {
    const { repo } = fakeLegislation();
    const run = createListChanges(repo, { today });
    await expect(
      run({ code: 'Code civil', since: '2026-05-01', until: '2026-04-01' }),
    ).rejects.toMatchObject({ kind: 'invalid_input' });
    await expect(run({ code: 'Code civil', since: '2026-02-30' })).rejects.toMatchObject({
      kind: 'invalid_input',
    });
  });

  it('rejects an unknown code with suggestions', async () => {
    const { repo } = fakeLegislation();
    const err = await createListChanges(repo, { today })({
      code: 'travail',
      since: '2026-01-01',
    }).catch((e) => e);
    expect(err).toMatchObject({ kind: 'invalid_input' });
    expect(err.message).toContain('Code du travail');
  });

  it('accepts a code abbreviation', async () => {
    const { repo, calls } = fakeLegislation();
    await createListChanges(repo, { today })({
      code: 'CGI',
      since: '2026-01-01',
      until: '2026-02-01',
    });
    expect(calls.listChanges[0]?.args[0]).toBe('LEGITEXT000006069577');
  });
});
