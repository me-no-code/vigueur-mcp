import { describe, expect, it } from 'vitest';
import { createGetArticleHistory } from '../../../src/services/legislation/history.js';
import type { HistoryEntry } from '../../../src/services/legislation/ports.js';
import { VigueurError } from '../../../src/shared/errors.js';
import { fakeLegislation, hitOf, lineage, makeArticle } from '../../helpers/fake-legislation.js';

const TODAY = '2026-11-12';
const today = () => TODAY;

const [OLD, NEW] = lineage(
  makeArticle({
    id: 'LEGIARTI000006438819',
    num: '1382',
    status: 'amended',
    validFrom: '1804-03-21',
    validTo: '2016-10-01',
  }),
  makeArticle({
    id: 'LEGIARTI000032042379',
    num: '1382',
    version: '2.0',
    cid: 'LEGIARTI000006438819',
    validFrom: '2016-10-01',
  }),
);
const ref = (id: string) => ({ id, num: '1', codeTitle: 'Code civil', label: id });
const EVENTS: HistoryEntry[] = [
  {
    date: '1804-03-21',
    undetermined: false,
    action: 'creation',
    amendingTitle: 'Loi',
    amendingArticleId: null,
  },
];

const kindOf = (r: object) => ('kind' in r ? r.kind : 'history');

describe('createGetArticleHistory', () => {
  it('returns versions in validFrom order and the concordance of first and current, per version', async () => {
    const { repo, calls } = fakeLegislation({
      articles: [NEW, OLD].filter((a) => a !== undefined),
      concordance: {
        [OLD?.version.id as string]: { from: [], to: [ref('A'), ref('B')] },
        [NEW?.version.id as string]: { from: [ref('C')], to: [ref('B')] },
      },
      history: { LEGIARTI000006438819: EVENTS },
    });
    const run = createGetArticleHistory(repo, { today });
    const res = await run({ code: 'Code civil', number: '1382' });
    if (!('versions' in res)) throw new Error('expected history');
    expect(res.kind).toBe('history');
    expect(res.codeTitle).toBe('Code civil');
    expect(res.num).toBe('1382');
    expect(res.versions.map((v) => v.id)).toEqual([OLD?.version.id, NEW?.version.id]);
    expect(res.current?.id).toBe(NEW?.version.id);
    expect(res.events).toEqual(EVENTS);
    // Where content went is scoped to the version that reported it; where the content now
    // under this number came from is merged.
    expect(res.concordance.moved.map((m) => [m.version.id, m.to.map((r) => r.id)])).toEqual([
      [OLD?.version.id, ['A', 'B']],
      [NEW?.version.id, ['B']],
    ]);
    expect(res.concordance.from.map((r) => r.id)).toEqual(['C']);
    expect(calls.getConcordance.map((c) => c.args[0]).sort()).toEqual(
      [OLD?.version.id, NEW?.version.id].sort(),
    );
    expect(calls.getArticleHistory[0]?.args).toEqual([
      'LEGITEXT000006070721',
      'LEGIARTI000006438819',
    ]);
  });

  it('Code civil 1240: the old payment content moved, not the tort article', async () => {
    // Lineage of 1240: the old payment article (moved to 1342-3, fixture 09's lienConcordes),
    // then the tort text formerly at 1382 (fixture 14).
    const [PAYMENT, TORT] = lineage(
      makeArticle({
        id: 'LEGIARTI000006437044',
        num: '1240',
        status: 'amended',
        validFrom: '1804-03-21',
        validTo: '2016-10-01',
      }),
      makeArticle({
        id: 'LEGIARTI000032041571',
        num: '1240',
        version: '2.0',
        cid: 'LEGIARTI000006437044',
        validFrom: '2016-10-01',
      }),
    );
    const civ = (id: string, num: string, flag: string) => ({
      id,
      num,
      codeTitle: 'Code civil',
      label: `Code civil - art. ${num} (${flag})`,
    });
    const REF_1342_3 = civ('LEGIARTI000032035241', '1342-3', 'V');
    const REF_1382 = civ('LEGIARTI000006438819', '1382', 'M');
    const { repo } = fakeLegislation({
      articles: [PAYMENT, TORT],
      concordance: {
        [PAYMENT.version.id]: { from: [REF_1382], to: [REF_1342_3] },
        [TORT.version.id]: { from: [REF_1382], to: [] },
      },
    });
    const res = await createGetArticleHistory(repo, { today })({
      code: 'Code civil',
      number: '1240',
    });
    if (!('versions' in res)) throw new Error('expected history');
    expect(res.concordance).toEqual({
      from: [REF_1382],
      moved: [{ version: PAYMENT.versions[0], to: [REF_1342_3] }],
    });
  });

  it('falls back to the latest period for a repealed article', async () => {
    const [A, B] = lineage(
      makeArticle({
        id: 'LEGIARTI000000000001',
        num: '9',
        status: 'amended',
        validFrom: '1990-01-01',
        validTo: '2000-01-01',
      }),
      makeArticle({
        id: 'LEGIARTI000000000002',
        num: '9',
        status: 'repealed',
        validFrom: '2000-01-01',
        validTo: '2010-01-01',
        cid: 'LEGIARTI000000000001',
      }),
    );
    const { repo } = fakeLegislation({ articles: [A, B] });
    const res = await createGetArticleHistory(repo, { today })({ code: 'Code civil', number: '9' });
    if (!('versions' in res)) throw new Error('expected history');
    expect(res.current).toBeNull();
    expect(res.versions).toHaveLength(2);
  });

  it('returns ambiguous when several codes share the number', async () => {
    const a = makeArticle({ id: 'LEGIARTI000000000010', num: 'L1', codeTitle: 'Code du travail' });
    const b = makeArticle({ id: 'LEGIARTI000000000011', num: 'L1', codeTitle: 'Code pénal' });
    const { repo } = fakeLegislation({ articles: [a, b] });
    const res = await createGetArticleHistory(repo, { today })({ number: 'L. 1' });
    expect(kindOf(res)).toBe('ambiguous');
  });

  it('returns ambiguous when all-versions hits span several codes', async () => {
    const a = makeArticle({
      id: 'LEGIARTI000000000010',
      num: 'L1',
      codeTitle: 'Code du travail',
      status: 'repealed',
      validTo: '2005-01-01',
    });
    const b = makeArticle({
      id: 'LEGIARTI000000000011',
      num: 'L1',
      codeTitle: 'Code pénal',
      status: 'repealed',
      validTo: '2005-01-01',
    });
    const { repo } = fakeLegislation({ articles: [a, b] });
    const res = await createGetArticleHistory(repo, { today })({ number: 'L1' });
    expect(kindOf(res)).toBe('ambiguous');
  });

  it('returns not_found for an unknown number and an unknown code, saying which', async () => {
    const { repo, calls } = fakeLegislation();
    const run = createGetArticleHistory(repo, { today });
    expect(await run({ code: 'Code civil', number: '99999' })).toEqual({
      kind: 'not_found',
      reason: 'no_article',
      num: '99999',
      codeTitle: 'Code civil',
      didYouMean: [],
    });
    const res = await run({ code: 'travail', number: '1' });
    expect(res).toEqual({
      kind: 'not_found',
      reason: 'unknown_code',
      num: '1',
      codeTitle: 'travail',
      didYouMean: [
        'Code du travail',
        'Code du travail applicable à Mayotte',
        'Code du travail maritime',
      ],
    });
    expect(calls.findArticleAt).toHaveLength(1); // the unknown code was never searched
  });

  it('resolves by id', async () => {
    const { repo } = fakeLegislation({ articles: [OLD, NEW] });
    const res = await createGetArticleHistory(repo, { today })({ id: NEW?.version.id });
    expect('versions' in res).toBe(true);
    const none = await createGetArticleHistory(repo, { today })({ id: 'LEGIARTI000099999999' });
    expect(none).toEqual({
      kind: 'not_found',
      reason: 'unknown_id',
      num: null,
      codeTitle: null,
      didYouMean: [],
    });
  });

  describe('all-versions candidates across codes', () => {
    const repealed = (i: number) =>
      makeArticle({
        id: `LEGIARTI0000000001${String(i).padStart(2, '0')}`,
        num: 'L1',
        codeTitle: `Code n° ${i}`,
        codeId: `LEGITEXT0000000001${String(i).padStart(2, '0')}`,
        status: 'repealed',
        validTo: '2005-01-01',
      });
    const hits = Array.from({ length: 25 }, (_, i) => hitOf(repealed(i)));

    it.each([
      [false, undefined],
      [true, true],
    ])('a page read in full (truncated %s) decides possiblyIncomplete', async (truncated, flag) => {
      const { repo } = fakeLegislation({
        overrides: { findArticleAllVersions: async () => ({ hits, truncated }) },
      });
      const res = await createGetArticleHistory(repo, { today })({ number: 'L1' });
      expect(kindOf(res)).toBe('ambiguous');
      expect('kind' in res && res.kind === 'ambiguous' && res.possiblyIncomplete).toBe(
        flag ?? undefined,
      );
    });
  });

  it('a failing concordance call leaves the history, with a warning', async () => {
    const { repo } = fakeLegislation({
      articles: [OLD, NEW],
      history: { LEGIARTI000006438819: EVENTS },
      overrides: {
        getConcordance: async (id) => {
          if (id === OLD.version.id) throw new TypeError('fetch failed');
          return { from: [ref('C')], to: [] };
        },
      },
    });
    const res = await createGetArticleHistory(repo, { today })({
      code: 'Code civil',
      number: '1382',
    });
    if (!('versions' in res)) throw new Error('expected history');
    expect(res.events).toEqual(EVENTS);
    expect(res.concordance.from.map((r) => r.id)).toEqual(['C']);
    expect(res.warnings).toEqual([
      `Could not read Légifrance's concordance of ${OLD.version.id} (fetch failed).`,
    ]);
  });

  it('a cancelled concordance call cancels the history', async () => {
    const cancelled = new VigueurError('cancelled', 'Légifrance: request cancelled.');
    const { repo } = fakeLegislation({
      articles: [OLD, NEW],
      overrides: {
        getConcordance: async () => {
          throw cancelled;
        },
      },
    });
    await expect(
      createGetArticleHistory(repo, { today })({ code: 'Code civil', number: '1382' }),
    ).rejects.toBe(cancelled);
  });

  it('has no warnings when every call succeeds', async () => {
    const { repo } = fakeLegislation({ articles: [OLD, NEW] });
    const res = await createGetArticleHistory(repo, { today })({ id: NEW.version.id });
    expect('warnings' in res && res.warnings).toEqual([]);
  });

  it('rejects missing target and bad id', async () => {
    const { repo } = fakeLegislation();
    const run = createGetArticleHistory(repo, { today });
    await expect(run({})).rejects.toBeInstanceOf(VigueurError);
    await expect(run({ id: 'nope' })).rejects.toMatchObject({ kind: 'invalid_input' });
  });
});
