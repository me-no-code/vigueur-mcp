import { describe, expect, it } from 'vitest';
import { createLegifranceCaseLawClient } from '../../../src/clients/legifrance/case-law.js';
import { VigueurError } from '../../../src/shared/errors.js';
import { type FakeRoute, fakePisteHttp } from '../../helpers/fake-piste-http.js';

function setup(path: '/consult/juri' | '/consult/cnil', fixture: string) {
  const fake = fakePisteHttp([{ path, fixture }]);
  return { repo: createLegifranceCaseLawClient(fake.http), calls: fake.calls };
}

describe('getDecision', () => {
  it('reads a Cour de cassation decision (fixture 42)', async () => {
    const { repo, calls } = setup('/consult/juri', '42-consult-juri-cass');
    const d = await repo.getDecision('JURITEXT000053197030');
    expect(calls.map((c) => c.req)).toEqual([
      { method: 'POST', path: '/consult/juri', body: { textId: 'JURITEXT000053197030' } },
    ]);
    expect(d).toMatchObject({
      id: 'JURITEXT000053197030',
      collection: 'judicial',
      court: 'Cour de cassation',
      chamber: 'Chambre sociale',
      decisionDate: '2025-12-17',
      numbers: ['24-16.924'],
      ecli: 'ECLI:FR:CCASS:2025:SO01200',
      solution: 'Cassation',
      publication: 'Inédit',
      summary: null,
      attacked: { court: "Cour d'appel de Bordeaux", date: '2024-05-29' },
    });
    expect(d?.text).toContain('\n');
    expect(d?.text).not.toContain('<');
  });

  it('reads the summary and the bulletin publication (fixtures 146 and 148)', async () => {
    const a = await setup('/consult/juri', '146-consult-juri-cass-24-17.365').repo.getDecision(
      'JURITEXT000054929456',
    );
    expect(a).toMatchObject({
      chamber: 'Deuxième chambre civile',
      numbers: ['24-17.365', '24-18.000'],
      publication: 'Publié au bulletin',
      summary: 'Cassation civil - SUBROGATION',
    });
    const b = await setup('/consult/juri', '148-consult-juri-cass-24-17.316').repo.getDecision(
      'JURITEXT000053029162',
    );
    expect(b?.summary).toMatch(/^Cassation civil - CONTRAT DE TRAVAIL, RUPTURE/);
    expect(b?.summary).toContain('\nIl résulte des articles 2 de la Déclaration');
    expect(b?.summary).not.toContain('<');
  });

  it('reads a Constitutional Council decision (fixture 44)', async () => {
    const d = await setup('/consult/juri', '44-consult-juri-constit').repo.getDecision(
      'CONSTEXT000054952962',
    );
    expect(d).toMatchObject({
      collection: 'constitutional',
      numbers: ['2026-1217/1218'],
      constitutionalCouncilUrl:
        'https://www.conseil-constitutionnel.fr/decision/2026/20261217_1218QPC.htm',
      court: 'Conseil constitutionnel',
    });
    expect(d?.joUrl).toEqual(expect.stringContaining('JORFTEXT000054633588'));
    expect(d?.text).not.toContain('&nbsp;');
  });

  it('reads a CNIL deliberation through /consult/cnil (fixture 45)', async () => {
    const { repo, calls } = setup('/consult/cnil', '45-consult-cnil');
    const d = await repo.getDecision('CNILTEXT000053716494');
    expect(calls[0]?.req.path).toBe('/consult/cnil');
    expect(d).toMatchObject({
      collection: 'cnil',
      labelledStatus: 'VIGUEUR',
      numbers: ['2026-023'],
    });
    expect(d?.publishedOn).toBe('2026-03-26');
  });

  it('reads a Conseil d’État decision (fixture 43)', async () => {
    const d = await setup('/consult/juri', '43-consult-juri-cetat').repo.getDecision(
      'CETATEXT000054960489',
    );
    expect(d).toMatchObject({
      collection: 'administrative',
      ecli: 'ECLI:FR:CEORD:2026:519801.20261006',
      chamber: 'Juge des référés',
      numbers: ['519801'],
    });
  });

  it('reads a Cour des comptes decision (fixture 46)', async () => {
    const d = await setup('/consult/juri', '46-consult-juri-jufi').repo.getDecision(
      'JUFITEXT000055005642',
    );
    expect(d).toMatchObject({ collection: 'financial', numbers: ['S-2026-1111'] });
  });

  it('answers null for the 400 "L\'expression à valider est fausse."', async () => {
    const fake = fakePisteHttp([
      {
        path: '/consult/juri',
        reply: new VigueurError(
          'invalid_input',
          'request rejected (HTTP 400): {"message":"L\'expression à valider est fausse."}',
        ),
      },
    ]);
    const repo = createLegifranceCaseLawClient(fake.http);
    expect(await repo.getDecision('JURITEXT000000000000')).toBeNull();
  });

  it('lets another 400 propagate', async () => {
    const routes: FakeRoute[] = [
      {
        path: '/consult/juri',
        reply: new VigueurError('invalid_input', 'request rejected (HTTP 400): {"message":"x"}'),
      },
    ];
    const repo = createLegifranceCaseLawClient(fakePisteHttp(routes).http);
    await expect(repo.getDecision('JURITEXT000000000000')).rejects.toMatchObject({
      kind: 'invalid_input',
    });
  });

  it('rejects an id of another kind without calling', async () => {
    const fake = fakePisteHttp([]);
    const repo = createLegifranceCaseLawClient(fake.http);
    await expect(repo.getDecision('LEGITEXT000006070721')).rejects.toMatchObject({
      kind: 'invalid_input',
    });
    expect(fake.calls).toEqual([]);
  });
});
