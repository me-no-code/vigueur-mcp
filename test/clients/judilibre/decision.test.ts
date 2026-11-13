import { describe, expect, it } from 'vitest';
import { createJudilibreClient } from '../../../src/clients/judilibre/client.js';
import { mapDecision } from '../../../src/clients/judilibre/wire.js';
import { createTokenProvider } from '../../../src/clients/piste/auth.js';
import { pisteEndpoints } from '../../../src/clients/piste/endpoints.js';
import type { PisteHttp, PisteRequest } from '../../../src/clients/piste/http.js';
import { createPisteHttp } from '../../../src/clients/piste/http.js';
import { loadFixture } from '../../helpers/fake-piste-http.js';
import { fixtureFetch } from '../../helpers/fixture-fetch.js';

/** The real `PisteHttp` over the fixture router answering `/decision` with `fixture`. */
function viaFixture(fixture: string, status?: number) {
  const { fetch, unmatched } = fixtureFetch([
    { api: 'judilibre', path: '/decision', fixture, ...(status !== undefined && { status }) },
  ]);
  const endpoints = pisteEndpoints('sandbox');
  const http = createPisteHttp({
    baseUrl: endpoints.judilibreBaseUrl,
    source: 'judilibre',
    tokens: createTokenProvider({
      tokenUrl: endpoints.oauthTokenUrl,
      clientId: 'id',
      clientSecret: 'secret',
      fetch,
    }),
    fetch,
  });
  return { repo: createJudilibreClient(http), unmatched };
}

const J45 = '45-decision-24-16.924';
const J47 = '47-decision-23-23.782-bulletin-files';
const J49 = '49-decision-ca-paris';
const J51 = '51-decision-24-17.365';
const J53 = '53-err-decision-unknown-id';
const J62 = '62-decision-23-20.348-rnsm';

describe("mapDecision: the outcome is this decision's own timeline entry", () => {
  /** A later decision in the same case (a cour d'appel de renvoi), listed after this one. */
  const LATER = {
    id: '6b0000000000000000000001',
    date: '2027-03-01',
    solution: 'Infirme la décision déférée dans toutes ses dispositions',
    title: "Cour d'appel de Paris\n6",
  };
  const withTimeline = (fixture: string, timeline: (old: unknown[]) => unknown[]) => {
    const raw = loadFixture(fixture, 'judilibre') as { timeline: unknown[] };
    return mapDecision({ ...raw, timeline: timeline(raw.timeline) });
  };

  it('picks the entry with this decision id, not a later decision', () => {
    const d = withTimeline(J51, (t) => [...t, LATER]);
    expect(d.solutionFull).toBe('Cassation partielle');
  });

  it('picks the entry dated on the decision date when this entry has no id', () => {
    const d = withTimeline(J45, (t) => [...t, LATER]);
    expect(d.solutionFull).toBe('Cassation');
  });

  it('is null when no entry is this decision', () => {
    const d = withTimeline(J45, (t) => [t[0], LATER]);
    expect(d.solutionFull).toBeNull();
  });
});

describe('getDecision', () => {
  it('maps a Cour de cassation decision with its zones, outcome and files', async () => {
    const { repo, unmatched } = viaFixture(J47);
    const d = await repo.getDecision('6af2c6c06c2e1778126fe2c7');
    expect(unmatched).toEqual([]);
    if (d === null) throw new Error('expected a decision');
    expect(d.zones).toHaveLength(7);
    expect(d.zones.map((z) => z.start)).toEqual(
      [...d.zones.map((z) => z.start)].sort((a, b) => a - b),
    );
    expect(d.zones.filter((z) => z.zone === 'moyens')).toHaveLength(2);
    expect(d.zones.filter((z) => z.zone === 'motivations')).toHaveLength(2);
    expect(d.text).toHaveLength(12395);
    expect(d.zones[d.zones.length - 1]?.end).toBe(d.text.length);
    // The first motivations segment is the short paragraph 4; "Réponse de la Cour" opens the second.
    const [, reply] = d.zones.filter((z) => z.zone === 'motivations');
    expect(d.text.slice(reply?.start, reply?.end).trimStart()).toMatch(/^Réponse de la Cour/);
    expect(d.solutionFull).toBe('Cassation partielle sans renvoi');
    expect(d.files).toHaveLength(2);
    expect(d.files[0]?.url).toContain('s3.fr-par.scw.cloud');
    expect(d.visa.length).toBeGreaterThan(0);
    expect(d.visa.join(' ')).not.toContain('<a');
    expect(d.numbers).toEqual(['23-23.782']);
    expect(d.updatedOn).toBe('2026-11-10');
    expect(d.titles).toEqual(['CONTRAT DE TRAVAIL, RUPTURE']);
  });

  it('has no zones when the source gives none, and keeps the attacked decision', async () => {
    const d = await viaFixture(J45).repo.getDecision('694252ab61c46255e1711cac');
    expect(d?.zones).toEqual([]);
    expect(d?.contested).not.toBeNull();
  });

  it('maps numbers, the attacked decision and rapprochements', async () => {
    const d = await viaFixture(J51).repo.getDecision('x');
    expect(d?.numbers).toEqual(['24-17.365', '24-18.000']);
    expect(d?.contested).toMatchObject({
      number: '21/03998',
      date: '2024-05-15',
      title: "Cour d'appel de Rennes, 07",
    });
    expect(d?.rapprochements).toHaveLength(1);
  });

  it('maps an appeal-court decision without a moyens zone', async () => {
    const d = await viaFixture(J49).repo.getDecision('x');
    expect(d?.jurisdiction.key).toBe('ca');
    expect(d?.zones.some((z) => z.zone === 'moyens')).toBe(false);
  });

  it('maps a non-specially-motivated rejection', async () => {
    const d = await viaFixture(J62).repo.getDecision('6a0e9ff1cdc6046d47668703');
    expect(d?.text).toHaveLength(2683);
    expect(d?.text).toContain('Rejet non spécialement motivé');
    expect(d?.zones.map((z) => z.zone)).toEqual(['introduction', 'motivations', 'dispositif']);
    expect(d?.contested).toMatchObject({
      number: '22/10744',
      date: '2023-06-22',
      judilibreId: '64953aa7aa086705db6f12ef',
    });
  });

  it('answers null for an unknown id (HTTP 404)', async () => {
    const { repo, unmatched } = viaFixture(J53, 404);
    expect(await repo.getDecision('000000000000000000000000')).toBeNull();
    expect(unmatched).toEqual([]);
  });

  it('sends only the id', async () => {
    const requests: PisteRequest[] = [];
    const http: PisteHttp = {
      async request<T>(req: PisteRequest): Promise<T> {
        requests.push(req);
        return loadFixture(J62, 'judilibre') as T;
      },
    };
    await createJudilibreClient(http).getDecision('6a0e9ff1cdc6046d47668703');
    expect(requests).toHaveLength(1);
    expect(requests[0]?.path).toBe('/decision');
    expect(requests[0]?.query).toEqual({ id: '6a0e9ff1cdc6046d47668703' });
  });

  it('takes the attacked decision id from its url when id is absent, else null', async () => {
    const raw = loadFixture(J62, 'judilibre') as { contested: Record<string, unknown> };
    const answer = (contested: Record<string, unknown>): PisteHttp => ({
      async request<T>(): Promise<T> {
        return { ...raw, contested } as T;
      },
    });
    const { id: _id, ...noId } = raw.contested;
    expect(
      (await createJudilibreClient(answer(noId)).getDecision('x'))?.contested?.judilibreId,
    ).toBe('64953aa7aa086705db6f12ef');
    const none = { ...noId, url: 'not-an-id' };
    expect(
      (await createJudilibreClient(answer(none)).getDecision('x'))?.contested?.judilibreId,
    ).toBeNull();
  });
});
