import { describe, expect, it } from 'vitest';
import { createListChanges } from '../../../src/services/legislation/changes.js';
import type {
  ChangeEntry,
  LegislationHit,
  TextRecord,
} from '../../../src/services/legislation/ports.js';
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
      target: 'code',
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

const LEGI = 'LEGITEXT000006068624';
const JORF = 'JORFTEXT000000886460';
const loi = (extra: Partial<TextRecord> = {}): TextRecord => ({
  id: LEGI,
  cid: JORF,
  title: 'Loi n° 78-17 relative à l’informatique',
  nature: 'LOI',
  status: 'in_force',
  jurisState: 'Vigueur',
  nor: 'JUSX7800001L',
  jorfLabel: null,
  publishedOn: '1978-01-07',
  signedOn: '1978-01-06',
  validFrom: null,
  validTo: null,
  visa: null,
  nota: null,
  sections: [],
  articles: [
    {
      id: 'A1',
      num: '1',
      status: 'in_force',
      rawStatus: 'VIGUEUR',
      validFrom: '1978-01-08',
      validTo: null,
      validToUndetermined: false,
      text: 'Texte.',
    },
  ],
  ...extra,
});
const hit = (textId: string, extra: Partial<LegislationHit> = {}): LegislationHit => ({
  kind: 'text',
  id: `${textId}-v`,
  textId,
  textCid: JORF,
  title: 'Loi 78-17',
  articleNumber: null,
  status: 'in_force',
  rawStatus: 'VIGUEUR',
  validFrom: null,
  validTo: null,
  snippet: null,
  nature: 'LOI',
  publishedOn: null,
  nor: null,
  ...extra,
});
const runText = (seed: Parameters<typeof fakeLegislation>[0], text: string) => {
  const f = fakeLegislation(seed);
  return {
    ...f,
    result: createListChanges(f.repo, { today })({ text, since: '2026-01-01' }),
  };
};

describe('createListChanges for a text', () => {
  it('"loi 78-17" lists the changes of the JORFTEXT cid and reports a text target', async () => {
    const { result, calls } = runText({ texts: [loi()], searchHits: [hit(LEGI)] }, 'loi 78-17');
    const res = await result;
    expect(calls.listChanges[0]?.args).toEqual([JORF, '2026-01-01', '2026-11-12']);
    expect(calls.searchLegislation[0]?.args[0]).toMatchObject({
      nature: 'LOI',
      textNumber: '78-17',
    });
    expect(res).toMatchObject({
      target: 'text',
      textId: LEGI,
      textTitle: 'Loi n° 78-17 relative à l’informatique',
    });
  });

  it.each([
    ['Décret n° 2019-1088', 'DECRET', '2019-1088', 'Décret n° 2019-1088'],
    ['Décret  n° 2019-1088', 'DECRET', '2019-1088', 'Décret n° 2019-1088'],
    ['De\u0301cret n° 2019-1088', 'DECRET', '2019-1088', 'Décret n° 2019-1088'], // NFD "é"
    ['loi  organique nº 2020-1', 'LOI', '2020-1', 'Loi organique n° 2020-1'],
    // LODA files organic laws under LOI: told apart by their title.
    ['loi organique 2020-1', 'LOI', '2020-1', 'Loi organique n° 2020-1'],
    ['arrêté 2021-5', 'ARRETE', '2021-5', 'Arrêté du 5 mai 2021'],
    ['ordonnance 2016-131', 'ORDONNANCE', '2016-131', 'Ordonnance n° 2016-131'],
  ])('parses "%s" as nature + number', async (input, nature, number, title) => {
    const { result, calls } = runText(
      { texts: [loi()], searchHits: [hit(LEGI, { title })] },
      input,
    );
    await result;
    expect(calls.searchLegislation[0]?.args[0]).toMatchObject({ nature, textNumber: number });
  });

  it('a number carried only by a text of another nature is invalid_input listing it', async () => {
    const { result, calls } = runText(
      { texts: [loi()], searchHits: [hit(LEGI, { title: 'Loi n° 78-17' })] },
      'loi organique 78-17',
    );
    const err = await result.catch((e) => e);
    expect(err).toMatchObject({ kind: 'invalid_input' });
    expect(err.message).toContain('No loi organique 78-17 on Légifrance');
    expect(err.message).toContain(`Loi n° 78-17 (${LEGI})`);
    expect(calls.listChanges).toHaveLength(0);
  });

  it('a LEGITEXT id is read by LEGITEXT: textId stays the LEGITEXT', async () => {
    const { result, calls } = runText({ texts: [loi()] }, LEGI);
    const res = await result;
    expect(calls.listChanges[0]?.args[0]).toBe(JORF);
    expect(res).toMatchObject({ target: 'text', textId: LEGI });
  });

  it('a JORFTEXT id or a NOR uses its JORFTEXT cid; textId is the JORFTEXT read', async () => {
    const jorf = loi({ id: JORF, cid: JORF });
    const byId = runText({ texts: [jorf] }, JORF);
    expect(await byId.result).toMatchObject({ target: 'text', textId: JORF });
    expect(byId.calls.listChanges[0]?.args[0]).toBe(JORF);
    const byNor = runText({ texts: [jorf] }, 'jusx7800001l');
    await byNor.result;
    expect(byNor.calls.listChanges[0]?.args[0]).toBe(JORF);
  });

  it('a not-in-force text with one candidate still has a change history (its cid)', async () => {
    const repealed = hit(LEGI, {
      status: 'repealed',
      rawStatus: 'ABROGE',
      validFrom: '1978-01-08',
      validTo: '2019-06-01',
    });
    const { result, calls } = runText(
      {
        overrides: {
          async searchLegislation(q) {
            return {
              total: 1,
              page: 1,
              pageSize: 10,
              hits: q.includeHistorical ? [repealed] : [],
            };
          },
        },
      },
      'loi 78-17',
    );
    const res = await result;
    expect(calls.listChanges[0]?.args).toEqual([JORF, '2026-01-01', '2026-11-12']);
    expect(res).toMatchObject({ target: 'text', textId: LEGI, textTitle: 'Loi 78-17' });
  });

  it('not in force with several candidates is invalid_input listing them', async () => {
    const other = 'LEGITEXT000099999999';
    const ended = (id: string, title: string) =>
      hit(id, {
        title,
        textCid: `JORF-${id}`,
        status: 'repealed',
        validFrom: '1978-01-08',
        validTo: '2019-06-01',
      });
    const { result } = runText(
      {
        overrides: {
          async searchLegislation(q) {
            return {
              total: 2,
              page: 1,
              pageSize: 10,
              hits: q.includeHistorical ? [ended(LEGI, 'Loi A'), ended(other, 'Loi B')] : [],
            };
          },
        },
      },
      'loi 1',
    );
    const err = await result.catch((e) => e);
    expect(err).toMatchObject({ kind: 'invalid_input' });
    expect(err.message).toContain(`Loi A (${LEGI})`);
    expect(err.message).toContain(`Loi B (${other})`);
  });

  it('ambiguous is invalid_input listing the candidates', async () => {
    const other = 'LEGITEXT000099999999';
    const { result } = runText(
      {
        searchHits: [
          hit(LEGI, { title: 'Loi A' }),
          hit(other, { title: 'Loi B', textCid: 'JORFTEXT000000000002' }),
        ],
      },
      'loi 1',
    );
    const err = await result.catch((e) => e);
    expect(err).toMatchObject({ kind: 'invalid_input' });
    expect(err.message).toContain(`Loi A (${LEGI})`);
    expect(err.message).toContain(`Loi B (${other})`);
  });

  it('not found echoes the input', async () => {
    const { result, calls } = runText({}, 'loi 99-99');
    const err = await result.catch((e) => e);
    expect(err).toMatchObject({ kind: 'invalid_input' });
    expect(err.message).toContain('loi 99-99');
    expect(calls.listChanges).toHaveLength(0);
  });

  it('an unparsable text names the accepted forms', async () => {
    const { result } = runText({}, 'informatique et libertés');
    const err = await result.catch((e) => e);
    expect(err).toMatchObject({ kind: 'invalid_input' });
    expect(err.message).toMatch(/LEGITEXT/);
    expect(err.message).toMatch(/loi 78-17/);
  });

  it('code and text together, or neither, are invalid_input', async () => {
    const { repo } = fakeLegislation();
    const run = createListChanges(repo, { today });
    await expect(
      run({ code: 'Code civil', text: 'loi 78-17', since: '2026-01-01' }),
    ).rejects.toMatchObject({ kind: 'invalid_input' });
    await expect(run({ since: '2026-01-01' })).rejects.toMatchObject({ kind: 'invalid_input' });
  });
});
