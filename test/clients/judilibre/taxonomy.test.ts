import { describe, expect, it } from 'vitest';
import { createJudilibreClient } from '../../../src/clients/judilibre/client.js';
import type { PisteHttp, PisteRequest } from '../../../src/clients/piste/http.js';
import { loadFixture } from '../../helpers/fake-piste-http.js';

function serving(fixture: string) {
  const requests: PisteRequest[] = [];
  const http: PisteHttp = {
    async request<T>(req: PisteRequest): Promise<T> {
      requests.push(req);
      return loadFixture(fixture, 'judilibre') as T;
    },
  };
  return { http, requests };
}

describe('taxonomy', () => {
  it('maps a key-to-label map', async () => {
    const { http, requests } = serving('29-taxonomy-cc-chamber');
    const { entries } = await createJudilibreClient(http).taxonomy('chamber', 'cc');
    expect(entries).toContainEqual({ key: 'soc', label: 'Chambre sociale', group: null });
    expect(requests[0]?.path).toBe('/taxonomy');
    expect(requests[0]?.query).toEqual({ id: 'chamber', context_value: 'cc' });
  });

  it('maps a flat list to entries without a key', async () => {
    const { entries } = await createJudilibreClient(serving('34-taxonomy-cc-theme').http).taxonomy(
      'theme',
      'cc',
    );
    expect(entries).toHaveLength(781);
    expect(entries.every((e) => e.key === null && e.group === null)).toBe(true);
  });

  it('maps nested lists to groups headed by their first string', async () => {
    const { entries } = await createJudilibreClient(serving('42-taxonomy-ca-theme').http).taxonomy(
      'theme',
      'ca',
    );
    expect(new Set(entries.map((e) => e.group)).size).toBe(9);
    const first = entries.filter((e) => e.group === 'Droit des personnes');
    expect(first.length).toBeGreaterThan(0);
    expect(first.some((e) => e.label === 'Droit des personnes')).toBe(false);
  });

  it('caches per id and context for 24 hours', async () => {
    const { http, requests } = serving('29-taxonomy-cc-chamber');
    let at = Date.parse('2026-11-13T10:00:00Z');
    const repo = createJudilibreClient(http, () => new Date(at));
    await repo.taxonomy('chamber', 'cc');
    await repo.taxonomy('chamber', 'cc');
    expect(requests).toHaveLength(1);
    await repo.taxonomy('chamber', 'ca');
    expect(requests).toHaveLength(2);
    at += 24 * 60 * 60 * 1000;
    await repo.taxonomy('chamber', 'cc');
    expect(requests).toHaveLength(3);
  });

  it('does not keep a failed fetch: the next call asks again', async () => {
    let calls = 0;
    const http: PisteHttp = {
      async request<T>(): Promise<T> {
        calls += 1;
        if (calls === 1) throw new Error('boom');
        return loadFixture('29-taxonomy-cc-chamber', 'judilibre') as T;
      },
    };
    const repo = createJudilibreClient(http, () => new Date('2026-11-13T10:00:00Z'));
    await expect(repo.taxonomy('chamber', 'cc')).rejects.toThrow('boom');
    expect((await repo.taxonomy('chamber', 'cc')).entries.length).toBeGreaterThan(0);
    expect(calls).toBe(2);
  });

  it('gives the time the list was fetched, also when it is served from the cache', async () => {
    const { http } = serving('29-taxonomy-cc-chamber');
    let at = Date.parse('2026-11-13T10:00:00Z');
    const repo = createJudilibreClient(http, () => new Date(at));
    const first = await repo.taxonomy('chamber', 'cc');
    expect(first.fetchedAt).toEqual(new Date('2026-11-13T10:00:00Z'));
    at += 60_000;
    const second = await repo.taxonomy('chamber', 'cc');
    expect(second.fetchedAt).toEqual(new Date('2026-11-13T10:00:00Z'));
    expect(second.entries).toBe(first.entries);
    at += 24 * 60 * 60 * 1000;
    expect((await repo.taxonomy('chamber', 'cc')).fetchedAt).toEqual(new Date(at));
  });
});
