import { describe, expect, it } from 'vitest';
import { createGetArticleHistory } from '../../../src/services/legislation/history.js';
import type { HistoryEntry } from '../../../src/services/legislation/ports.js';
import { VigueurError } from '../../../src/shared/errors.js';
import { fakeLegislation, lineage, makeArticle } from '../../helpers/fake-legislation.js';

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
  it('returns versions in validFrom order and merged concordance of first and current', async () => {
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
    expect(res.codeTitle).toBe('Code civil');
    expect(res.num).toBe('1382');
    expect(res.versions.map((v) => v.id)).toEqual([OLD?.version.id, NEW?.version.id]);
    expect(res.current?.id).toBe(NEW?.version.id);
    expect(res.events).toEqual(EVENTS);
    expect(res.concordance.to.map((r) => r.id)).toEqual(['A', 'B']);
    expect(res.concordance.from.map((r) => r.id)).toEqual(['C']);
    expect(calls.getConcordance.map((c) => c.args[0]).sort()).toEqual(
      [OLD?.version.id, NEW?.version.id].sort(),
    );
    expect(calls.getArticleHistory[0]?.args).toEqual([
      'LEGITEXT000006070721',
      'LEGIARTI000006438819',
    ]);
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

  it('returns not_found for an unknown number and an unknown code', async () => {
    const { repo } = fakeLegislation();
    const run = createGetArticleHistory(repo, { today });
    expect(kindOf(await run({ code: 'Code civil', number: '99999' }))).toBe('not_found');
    const res = await run({ code: 'travail', number: '1' });
    expect(res).toMatchObject({
      kind: 'not_found',
      didYouMean: [
        'Code du travail',
        'Code du travail applicable à Mayotte',
        'Code du travail maritime',
      ],
    });
  });

  it('resolves by id', async () => {
    const { repo } = fakeLegislation({ articles: [OLD, NEW] });
    const res = await createGetArticleHistory(repo, { today })({ id: NEW?.version.id });
    expect('versions' in res).toBe(true);
    const none = await createGetArticleHistory(repo, { today })({ id: 'LEGIARTI000099999999' });
    expect(kindOf(none)).toBe('not_found');
  });

  it('rejects missing target and bad id', async () => {
    const { repo } = fakeLegislation();
    const run = createGetArticleHistory(repo, { today });
    await expect(run({})).rejects.toBeInstanceOf(VigueurError);
    await expect(run({ id: 'nope' })).rejects.toMatchObject({ kind: 'invalid_input' });
  });
});
