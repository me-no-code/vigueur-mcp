import { describe, expect, it } from 'vitest';
import { createGetText } from '../../../src/services/legislation/get-text.js';
import type {
  LegislationHit,
  TextArticle,
  TextRecord,
  TextSection,
} from '../../../src/services/legislation/ports.js';
import { VigueurError } from '../../../src/shared/errors.js';
import { fakeLegislation } from '../../helpers/fake-legislation.js';

const TODAY = '2026-11-12';
const LOI = 'LEGITEXT000006068624';
const LOI_2 = 'LEGITEXT000099999999';
const JORF = 'JORFTEXT000000886460';

const art = (id: string, num: string): TextArticle => ({
  id,
  num,
  status: 'in_force',
  rawStatus: 'VIGUEUR',
  validFrom: '1978-01-08',
  validTo: null,
  validToUndetermined: false,
  text: `Texte ${num}.`,
});
const sec = (
  cid: string,
  title: string,
  articles: TextArticle[],
  sections: TextSection[] = [],
): TextSection => ({
  id: `${cid}-v`,
  cid,
  title,
  status: 'in_force',
  validFrom: null,
  validTo: null,
  sections,
  articles,
});

const record = (id: string, extra: Partial<TextRecord> = {}): TextRecord => ({
  id,
  cid: id,
  title: 'Loi relative à l’informatique',
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
  sections: [
    sec(
      'S1',
      'Chapitre I',
      [art('A1', '1'), art('A2', '2')],
      [sec('S1a', 'Section 1', [art('A3', '3')])],
    ),
    sec('S2', 'Chapitre II', [art('A4', '4')]),
  ],
  articles: [art('A0', 'Préambule')],
  ...extra,
});

const hit = (textId: string): LegislationHit => ({
  kind: 'text',
  id: `${textId}-v`,
  textId,
  textCid: null,
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
});

const setup = (seed: Parameters<typeof fakeLegislation>[0] = {}) => {
  const f = fakeLegislation(seed);
  return { ...f, run: createGetText(f.repo, { today: () => TODAY }) };
};

const rejects = async (p: Promise<unknown>) => {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(VigueurError);
  expect((err as VigueurError).kind).toBe('invalid_input');
  return (err as VigueurError).message;
};

describe('getText routes', () => {
  it('LEGITEXT id reads getText on today (Paris) and links to loda', async () => {
    const { run, calls } = setup({ texts: [record(LOI)] });
    const r = await run({ id: LOI });
    expect(calls.getText[0]?.args).toEqual([LOI, TODAY]);
    if (r.kind !== 'found') throw new Error('expected found');
    expect(r.text.asOf).toBe(TODAY);
    expect(r.text.url).toBe(`https://www.legifrance.gouv.fr/loda/id/${LOI}`);
    expect(r.text.focus).toBeNull();
  });

  it('atDate is passed to getText', async () => {
    const { run, calls } = setup({ texts: [record(LOI)] });
    await run({ id: LOI, atDate: '2020-01-01' });
    expect(calls.getText[0]?.args).toEqual([LOI, '2020-01-01']);
  });

  it('JORFTEXT id reads getJorfText and links to jorf', async () => {
    const { run, calls } = setup({ texts: [record(JORF)] });
    const r = await run({ id: JORF });
    expect(calls.getJorfText[0]?.args).toEqual([JORF]);
    expect(calls.getText).toHaveLength(0);
    if (r.kind !== 'found') throw new Error('expected found');
    expect(r.text.url).toBe(`https://www.legifrance.gouv.fr/jorf/id/${JORF}`);
  });

  it('NOR is trimmed, uppercased and read as published', async () => {
    const { run, calls } = setup({ texts: [record(JORF, { nor: 'JUSX7800001L' })] });
    const r = await run({ nor: ' jusx7800001l ' });
    expect(calls.getJorfTextByNor[0]?.args).toEqual(['JUSX7800001L']);
    expect(r.kind).toBe('found');
  });

  it('unknown id and NOR are not_found, echoing the input', async () => {
    const { run } = setup();
    expect(await run({ id: LOI })).toEqual({ kind: 'not_found', input: LOI });
    expect(await run({ nor: 'abcd1234567x' })).toEqual({
      kind: 'not_found',
      input: 'ABCD1234567X',
    });
  });

  it('atDate with a JORFTEXT or a NOR is invalid_input', async () => {
    const { run } = setup({ texts: [record(JORF)] });
    expect(await rejects(run({ id: JORF, atDate: '2020-01-01' }))).toMatch(/at_date|atDate/i);
    await rejects(run({ nor: 'JUSX7800001L', atDate: '2020-01-01' }));
  });
});

describe('getText by nature and number', () => {
  it('one hit → found via getText, with the API nature', async () => {
    const { run, calls } = setup({ texts: [record(LOI)], searchHits: [hit(LOI), hit(LOI)] });
    const r = await run({ nature: 'loi', number: '78-17' });
    expect(calls.searchLegislation[0]?.args[0]).toEqual({
      collection: 'loda',
      textNumber: '78-17',
      nature: 'LOI',
      atDate: TODAY,
      includeHistorical: false,
      page: 1,
      pageSize: 10,
    });
    expect(calls.getText[0]?.args).toEqual([LOI, TODAY]);
    expect(r.kind).toBe('found');
  });

  it('maps every nature', async () => {
    const { run, calls } = setup();
    for (const [nature, api] of [
      ['loi_organique', 'LOI_ORGANIQUE'],
      ['ordonnance', 'ORDONNANCE'],
      ['decret', 'DECRET'],
      ['arrete', 'ARRETE'],
    ] as const) {
      await run({ nature, number: '1' });
      expect(calls.searchLegislation.at(-1)?.args[0].nature).toBe(api);
    }
  });

  it('two distinct texts → ambiguous, nothing fetched', async () => {
    const { run, calls } = setup({ searchHits: [hit(LOI), hit(LOI_2)] });
    const r = await run({ nature: 'decret', number: '2019-1088' });
    expect(r.kind).toBe('ambiguous');
    if (r.kind === 'ambiguous') expect(r.candidates.map((c) => c.textId)).toEqual([LOI, LOI_2]);
    expect(calls.getText).toHaveLength(0);
  });

  it('two in-force hits sharing one cid (décret 2005-1309 in production) → ambiguous, no fallback', async () => {
    const a = {
      ...hit(LOI),
      title: 'Décret 2005-1309',
      rawStatus: 'MODIFIE',
      status: 'amended' as const,
    };
    const b = {
      ...hit(LOI_2),
      title: 'Décret 2005-1309',
      rawStatus: 'ABROGE',
      status: 'repealed' as const,
    };
    const { run, calls } = setup({ searchHits: [a, b] });
    const r = await run({ nature: 'decret', number: '2005-1309' });
    expect(r).toMatchObject({ kind: 'ambiguous', more: false });
    if (r.kind === 'ambiguous') expect(r.candidates.map((c) => c.textId)).toEqual([LOI, LOI_2]);
    expect(calls.searchLegislation).toHaveLength(1);
    expect(calls.getText).toHaveLength(0);
  });

  it('no hit → not_found echoing the target', async () => {
    const { run } = setup();
    expect(await run({ nature: 'loi', number: '78-17' })).toEqual({
      kind: 'not_found',
      input: 'loi 78-17',
    });
  });

  it('nothing in force but a repealed text on record → not_in_force, never fetched', async () => {
    const repealed: LegislationHit = { ...hit(LOI), status: 'repealed', rawStatus: 'ABROGE' };
    const { run, calls } = setup({
      texts: [record(LOI)],
      overrides: {
        async searchLegislation(q) {
          return {
            total: 1,
            page: 1,
            pageSize: 10,
            hits: q.includeHistorical ? [repealed, repealed] : [],
          };
        },
      },
    });
    const r = await run({ nature: 'decret', number: '2019-1088' });
    expect(r).toEqual({
      kind: 'not_in_force',
      input: 'decret 2019-1088',
      asOf: TODAY,
      candidates: [
        {
          textId: LOI,
          textCid: null,
          title: 'Loi 78-17',
          nature: 'LOI',
          nor: null,
          publishedOn: null,
          verdict: 'undetermined',
          on: null,
        },
      ],
      more: false,
    });
    expect(calls.searchLegislation.map((c) => c.args[0].includeHistorical)).toEqual([false, true]);
    expect(calls.searchLegislation[1]?.args[0]).toEqual({
      ...calls.searchLegislation[0]?.args[0],
      includeHistorical: true,
    });
    expect(calls.getText).toHaveLength(0);
  });

  describe('fallback candidates are judged by their dates', () => {
    const WARNING = `Légifrance's in-force search did not return this text; its dates say it is in force on ${TODAY}.`;
    const dated = (
      textId: string,
      validFrom: string | null,
      validTo: string | null,
      rawStatus = 'VIGUEUR',
    ): LegislationHit => ({
      ...hit(textId),
      validFrom,
      validTo,
      rawStatus,
    });
    const fallbackOnly = (hits: LegislationHit[], total = hits.length) =>
      setup({
        texts: [record(LOI), record(LOI_2)],
        overrides: {
          async searchLegislation(q) {
            return {
              total: q.includeHistorical ? total : 0,
              page: 1,
              pageSize: 10,
              hits: q.includeHistorical ? hits : [],
            };
          },
        },
      });

    it('one candidate whose dates cover asOf → found with the warning, fetched by id', async () => {
      const { run, calls } = fallbackOnly([dated(LOI, '2005-10-22', null)]);
      const r = await run({ nature: 'decret', number: '2005-1309' });
      expect(r.kind).toBe('found');
      if (r.kind === 'found') expect(r.text.warnings).toEqual([WARNING]);
      expect(calls.getText[0]?.args).toEqual([LOI, TODAY]);
    });

    it('a label saying in force does not matter when the dates say it ended', async () => {
      const { run, calls } = fallbackOnly([dated(LOI, '2005-10-22', '2019-06-01', 'VIGUEUR')]);
      const r = await run({ nature: 'decret', number: '2005-1309' });
      expect(r).toMatchObject({
        kind: 'not_in_force',
        candidates: [{ textId: LOI, verdict: 'ended', on: '2019-06-01' }],
      });
      expect(calls.getText).toHaveLength(0);
    });

    it('two candidates covering asOf → ambiguous with those only', async () => {
      const { run, calls } = fallbackOnly(
        [
          dated(LOI, '2005-10-22', null),
          dated(LOI_2, '2001-01-01', null),
          dated('LEGITEXT000000000001', '2000-01-01', '2001-01-01'),
        ],
        3,
      );
      const r = await run({ nature: 'decret', number: '1' });
      expect(r).toMatchObject({ kind: 'ambiguous', more: false });
      if (r.kind === 'ambiguous') expect(r.candidates.map((c) => c.textId)).toEqual([LOI, LOI_2]);
      expect(calls.getText).toHaveLength(0);
    });

    it('a candidate entering into force after asOf → not_in_force', async () => {
      const { run } = fallbackOnly([dated(LOI, '2027-01-01', null)]);
      expect(await run({ nature: 'loi', number: '1' })).toMatchObject({
        kind: 'not_in_force',
        candidates: [{ verdict: 'not_yet', on: '2027-01-01' }],
      });
    });

    it('a candidate with unknown validFrom → not_in_force', async () => {
      const { run } = fallbackOnly([dated(LOI, null, null)]);
      expect((await run({ nature: 'loi', number: '1' })).kind).toBe('not_in_force');
    });

    it('announces more matches on not_in_force only when the page total exceeds its results', async () => {
      const { run } = fallbackOnly([dated(LOI, '2000-01-01', '2010-01-01')], 14);
      expect(await run({ nature: 'loi', number: '1' })).toMatchObject({
        kind: 'not_in_force',
        more: true,
      });
      const exact = fallbackOnly([dated(LOI, '2000-01-01', '2010-01-01')]);
      expect(await exact.run({ nature: 'loi', number: '1' })).toMatchObject({ more: false });
    });

    it('a covering candidate Légifrance does not return is an unexpected response', async () => {
      const { run } = setup({
        overrides: {
          async searchLegislation(q) {
            return {
              total: 1,
              page: 1,
              pageSize: 10,
              hits: q.includeHistorical ? [dated(LOI, '2000-01-01', null)] : [],
            };
          },
        },
      });
      await expect(run({ nature: 'loi', number: '1' })).rejects.toMatchObject({
        kind: 'unexpected_response',
      });
    });
  });

  describe('one cid is one text; force comes from article dates', () => {
    const container = (textId: string, rawStatus: string): LegislationHit => ({
      ...hit(textId),
      textCid: 'JORFTEXT000000241445',
      rawStatus,
    });
    const dead = (id: string): TextRecord =>
      record(id, {
        sections: [],
        articles: [
          { ...art('A1', '1'), status: 'repealed', rawStatus: 'ABROGE', validTo: '2019-06-01' },
          // Sentinel window (2999 → 2999): both ends parse to null, never in force.
          { ...art('A82', '82'), validFrom: null, validTo: null },
        ],
      });

    it('two containers of one cid are one text, the non-MODIFIE highest id is read', async () => {
      const { run, calls } = setup({
        texts: [record(LOI), record(LOI_2)],
        searchHits: [container(LOI, 'MODIFIE'), container(LOI_2, 'ABROGE')],
      });
      const r = await run({ nature: 'decret', number: '2005-1309' });
      expect(r.kind).toBe('found');
      expect(calls.getText[0]?.args[0]).toBe(LOI_2);
    });

    it('different cids stay ambiguous', async () => {
      const { run } = setup({
        searchHits: [container(LOI, 'VIGUEUR'), { ...hit(LOI_2), textCid: 'JORFTEXT000000000002' }],
      });
      expect((await run({ nature: 'decret', number: '1' })).kind).toBe('ambiguous');
    });

    it('a text whose articles all ended is not_in_force, never found (by number)', async () => {
      const { run } = setup({ texts: [dead(LOI)], searchHits: [container(LOI, 'ABROGE')] });
      const r = await run({ nature: 'decret', number: '2005-1309' });
      expect(r).toMatchObject({
        kind: 'not_in_force',
        more: false,
        candidates: [{ textId: LOI, verdict: 'ended', on: '2019-06-01' }],
      });
    });

    it('the same verdict applies to a LEGITEXT id', async () => {
      const { run } = setup({ texts: [dead(LOI)] });
      expect(await run({ id: LOI })).toMatchObject({
        kind: 'not_in_force',
        input: LOI,
        candidates: [{ verdict: 'ended', on: '2019-06-01' }],
      });
    });

    it('JORFTEXT reads carry no verdict', async () => {
      const { run } = setup({ texts: [dead(JORF)] });
      expect((await run({ id: JORF })).kind).toBe('found');
    });
  });

  it('a normal found result carries no warning', async () => {
    const { run } = setup({ texts: [record(LOI)], searchHits: [hit(LOI)] });
    const r = await run({ nature: 'loi', number: '78-17' });
    if (r.kind === 'found') expect(r.text.warnings).toEqual([]);
  });

  it('an in-force hit makes no fallback search', async () => {
    const { run, calls } = setup({ texts: [record(LOI)], searchHits: [hit(LOI)] });
    await run({ nature: 'loi', number: '78-17' });
    expect(calls.searchLegislation).toHaveLength(1);
  });

  it('a listed text Légifrance does not return is an unexpected response, not "not found"', async () => {
    const { run } = setup({ searchHits: [hit(LOI)] });
    await expect(run({ nature: 'loi', number: '78-17' })).rejects.toMatchObject({
      kind: 'unexpected_response',
    });
  });
});

describe('getText input validation', () => {
  it('needs exactly one target', async () => {
    const { run } = setup();
    expect(await rejects(run({}))).toMatch(/nor/);
    await rejects(run({ id: LOI, nor: 'JUSX7800001L' }));
    await rejects(run({ id: LOI, nature: 'loi', number: '78-17' }));
    await rejects(run({ nature: 'loi' }));
    await rejects(run({ number: '78-17' }));
  });

  it('KALITEXT ids point to the search tool', async () => {
    const { run, calls } = setup();
    expect(await rejects(run({ id: 'KALITEXT000005635534' }))).toMatch(
      /legifrance_search_legislation/,
    );
    expect(calls.getText).toHaveLength(0);
  });

  it('other malformed ids and bad dates are invalid_input', async () => {
    const { run } = setup();
    await rejects(run({ id: 'LEGITEXT123' }));
    await rejects(run({ id: 'LEGIARTI000006438819' }));
    await rejects(run({ id: LOI, atDate: '2020-13-45' }));
  });
});

describe('getText structure', () => {
  const seeded = () => setup({ texts: [record(LOI)] });

  it('flatArticles is depth-first with section paths', async () => {
    const r = await seeded().run({ id: LOI });
    if (r.kind !== 'found') throw new Error('expected found');
    expect(r.text.flatArticles.map((f) => [f.article.num, f.path])).toEqual([
      ['Préambule', []],
      ['1', ['Chapitre I']],
      ['2', ['Chapitre I']],
      ['3', ['Chapitre I', 'Section 1']],
      ['4', ['Chapitre II']],
    ]);
  });

  it('sectionCid narrows focus and flatArticles to the subtree', async () => {
    const r = await seeded().run({ id: LOI, sectionCid: 'S1' });
    if (r.kind !== 'found') throw new Error('expected found');
    expect(r.text.focus?.cid).toBe('S1');
    expect(r.text.flatArticles.map((f) => f.article.num)).toEqual(['1', '2', '3']);
    expect(r.text.flatArticles[2]?.path).toEqual(['Chapitre I', 'Section 1']);
  });

  it('unknown sectionCid is invalid_input', async () => {
    await rejects(seeded().run({ id: LOI, sectionCid: 'NOPE' }));
  });
});

describe('getText signal', () => {
  it('forwards ctx to every repository call', async () => {
    const ctx = { signal: new AbortController().signal };
    const { run, calls } = setup({ texts: [record(LOI)], searchHits: [hit(LOI)] });
    await run({ nature: 'loi', number: '78-17' }, ctx);
    await run({ id: LOI }, ctx);
    await run({ id: JORF }, ctx);
    await run({ nor: 'JUSX7800001L' }, ctx);
    expect(calls.searchLegislation[0]?.ctx).toBe(ctx);
    expect(calls.getText.every((c) => c.ctx === ctx)).toBe(true);
    expect(calls.getJorfText[0]?.ctx).toBe(ctx);
    expect(calls.getJorfTextByNor[0]?.ctx).toBe(ctx);
  });
});
