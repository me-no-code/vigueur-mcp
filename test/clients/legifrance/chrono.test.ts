import { describe, expect, it } from 'vitest';
import { createLegifranceClient } from '../../../src/clients/legifrance/client.js';
import { DEFAULT_TIMEOUT_MS } from '../../../src/clients/piste/http.js';
import { DEFAULT_DEADLINE_MS } from '../../../src/tools/format.js';
import { fakePisteHttp } from '../../helpers/fake-piste-http.js';

const CIVIL = 'LEGITEXT000006070721';
const today = () => new Date('2026-11-12T15:30:00Z');

function setup(reply?: unknown) {
  const fake = fakePisteHttp([
    reply === undefined
      ? { path: '/chrono/textCid', fixture: '24-chrono-textCid-civil-2025-2026' }
      : { path: '/chrono/textCid', reply },
  ]);
  return { repo: createLegifranceClient(fake.http, { now: today }), calls: fake.calls };
}

describe('listChanges', () => {
  it('gives a long change log more time than a normal request, within the call deadline', async () => {
    const { repo, calls } = setup();
    await repo.listChanges(CIVIL, '2025-01-01', '2026-12-31');
    const timeoutMs = calls[0]?.opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    expect(timeoutMs).toBeGreaterThan(DEFAULT_TIMEOUT_MS);
    expect(timeoutMs).toBeLessThan(DEFAULT_DEADLINE_MS);
  });

  it('requests the years of the range with today as consultation date', async () => {
    const { repo, calls } = setup();
    await repo.listChanges(CIVIL, '2025-01-01', '2026-12-31');
    expect(calls[0]?.req).toEqual({
      method: 'POST',
      path: '/chrono/textCid',
      body: { textCid: CIVIL, dateConsult: '2026-11-12', startYear: 2025, endYear: 2026 },
    });
  });

  it('consults the code as of the Paris calendar date', async () => {
    const fake = fakePisteHttp([
      { path: '/chrono/textCid', fixture: '24-chrono-textCid-civil-2025-2026' },
    ]);
    const repo = createLegifranceClient(fake.http, {
      now: () => new Date('2026-11-11T23:30:00Z'),
    });
    await repo.listChanges(CIVIL, '2025-01-01', '2026-12-31');
    expect(fake.calls[0]?.req.body).toMatchObject({ dateConsult: '2026-11-12' });
  });

  it('flattens versions, amending texts and target articles', async () => {
    const { repo } = setup();
    const log = await repo.listChanges(CIVIL, '2025-01-01', '2026-12-31');
    expect(log.entries).toContainEqual(
      expect.objectContaining({
        articleNum: '61-3-1',
        amendingTitle: 'LOI n°2026-667 du 27 juillet 2026 - art. 7',
        date: '2026-07-29',
      }),
    );
    const entry = log.entries.find((e) => e.articleNum === '61-3-1');
    expect(entry?.articleId).toMatch(/^LEGIARTI\d+$/);
    expect(entry?.sectionTitle).toMatch(/^Section|^Chapitre|^Titre/);
    expect(entry?.amendingArticleId).toBe('LEGIARTI000054500222');
    for (const e of log.entries) {
      expect(e.date >= '2025-01-01' && e.date <= '2026-12-31').toBe(true);
    }
  });

  it('excludes entries outside the range', async () => {
    const { repo } = setup();
    const log = await repo.listChanges(CIVIL, '2026-08-01', '2026-12-31');
    expect(log.entries.length).toBeGreaterThan(0);
    expect(log.entries.every((e) => e.date >= '2026-08-01')).toBe(true);
    expect(log.entries.some((e) => e.date === '2026-07-29')).toBe(false);
  });

  it('excludes entries after the upper bound', async () => {
    const { repo } = setup();
    const log = await repo.listChanges(CIVIL, '2025-01-01', '2026-06-30');
    expect(log.entries.length).toBeGreaterThan(0);
    expect(log.entries.every((e) => e.date <= '2026-06-30')).toBe(true);
    expect(log.entries.some((e) => e.date === '2026-07-29')).toBe(false);
    expect(log.entries.some((e) => e.articleNum === '61-3-1')).toBe(false);
  });

  it('lists entries oldest first', async () => {
    const { repo } = setup();
    const { entries } = await repo.listChanges(CIVIL, '2025-01-01', '2026-12-31');
    const dates = entries.map((e) => e.date);
    expect(dates).toEqual([...dates].sort());
  });

  it('reports years in range whose detail was not loaded', async () => {
    const { repo } = setup();
    const log = await repo.listChanges(CIVIL, '2024-06-01', '2026-12-31');
    expect(log.detailMissingYears).toEqual(['2024']);
  });

  it('counts undetermined-date versions apart from the entries', async () => {
    const target = {
      name: '12',
      id: 'LEGIARTI000000000012',
      cid: 'LEGIARTI000000000012',
    };
    const version = (n: number) => ({
      dateDebut: 0,
      isEndVersion: false,
      articlesModificateurs: {
        UNKNOWN: {
          title: `Ordonnance ${n}`,
          id: 'UNKNOWN',
          actions: {
            ABROGATION: {
              action: 'ABROGATION',
              parents: {
                LEGISCTA1: { name: ' Titre I \r\n', articlesCibles: { [target.id]: target } },
              },
            },
          },
        },
      },
    });
    const { repo } = setup({
      regroupements: [
        {
          title: '2026',
          detailLoaded: true,
          versions: { '2222-02-22': version(1), '2026-03-01': version(2) },
        },
      ],
    });
    const log = await repo.listChanges(CIVIL, '2026-01-01', '2026-12-31');
    expect(log.undeterminedCount).toBe(1);
    expect(log.entries).toEqual([
      {
        date: '2026-03-01',
        action: 'abrogation',
        articleNum: '12',
        articleId: 'LEGIARTI000000000012',
        sectionTitle: 'Titre I',
        amendingTitle: 'Ordonnance 2',
        amendingArticleId: null,
      },
    ]);
  });

  it('reports a malformed body as an unexpected response', async () => {
    const { repo } = setup({ regroupements: 'nope' });
    await expect(repo.listChanges(CIVIL, '2025-01-01', '2026-12-31')).rejects.toMatchObject({
      kind: 'unexpected_response',
    });
  });
});
