import { describe, expect, it } from 'vitest';
import { createSearchLegislation } from '../../../src/services/legislation/search.js';
import { fakeLegislation } from '../../helpers/fake-legislation.js';

const today = () => '2026-11-12';

describe('createSearchLegislation', () => {
  it('forwards defaults and normalized values, omitting blank inputs', async () => {
    const { repo, calls } = fakeLegislation();
    const res = await createSearchLegislation(repo, { today })({
      collection: 'codes',
      query: ' responsabilité ',
      code: 'Code civil',
      articleNumber: 'Art. L. 1234-1',
      nor: '',
      nature: '  ',
      idcc: '',
    });
    expect(calls.searchLegislation[0]?.args[0]).toEqual({
      collection: 'codes',
      text: 'responsabilité',
      codeTitle: 'Code civil',
      articleNumber: 'L1234-1',
      atDate: '2026-11-12',
      includeHistorical: false,
      page: 1,
      pageSize: 10,
    });
    expect(res.pageSize).toBe(10);
  });

  it('forwards explicit values', async () => {
    const { repo, calls } = fakeLegislation();
    await createSearchLegislation(repo, { today })({
      collection: 'loda',
      textNumber: '2016-131',
      atDate: '2020-01-01',
      includeHistorical: true,
      publishedFrom: '2016-01-01',
      publishedTo: '2016-12-31',
      page: 2,
      pageSize: 50,
    });
    expect(calls.searchLegislation[0]?.args[0]).toMatchObject({
      textNumber: '2016-131',
      atDate: '2020-01-01',
      includeHistorical: true,
      publishedFrom: '2016-01-01',
      publishedTo: '2016-12-31',
      page: 2,
      pageSize: 50,
    });
  });

  it('reads a text number and a NOR as get_text does', async () => {
    const { repo, calls } = fakeLegislation();
    const run = createSearchLegislation(repo, { today });
    await run({ collection: 'loda', textNumber: 'n° 78 – 17' });
    await run({ collection: 'jorf', nor: ' jusc1522466r ' });
    expect(calls.searchLegislation.map((c) => c.args[0])).toMatchObject([
      { textNumber: '78-17' },
      { nor: 'JUSC1522466R' },
    ]);
  });

  it('rejects pageSize 51, page 0 and bad dates', async () => {
    const { repo } = fakeLegislation();
    const run = createSearchLegislation(repo, { today });
    await expect(run({ collection: 'codes', pageSize: 51 })).rejects.toMatchObject({
      kind: 'invalid_input',
    });
    await expect(run({ collection: 'codes', pageSize: 0 })).rejects.toMatchObject({
      kind: 'invalid_input',
    });
    await expect(run({ collection: 'codes', page: 0 })).rejects.toMatchObject({
      kind: 'invalid_input',
    });
    await expect(run({ collection: 'codes', atDate: '2020-13-01' })).rejects.toMatchObject({
      kind: 'invalid_input',
    });
  });

  it.each([
    ['jorf', '"published_from" / "published_to"'],
    ['kali', 'currently in force (extended or not)'],
  ] as const)('rejects at_date for %s, with guidance', async (collection, guidance) => {
    const { repo, calls } = fakeLegislation();
    const err = await createSearchLegislation(repo, { today })({
      collection,
      query: 'x',
      atDate: '2015-01-01',
    }).catch((e) => e);
    expect(err).toMatchObject({ kind: 'invalid_input' });
    expect(err.message).toContain(`"at_date" does not apply to the ${collection} collection`);
    expect(err.message).toContain(guidance);
    expect(calls.searchLegislation).toHaveLength(0);
  });

  it('accepts jorf and kali without at_date', async () => {
    const { repo, calls } = fakeLegislation();
    const run = createSearchLegislation(repo, { today });
    await run({ collection: 'jorf', nor: 'JUSC1522466R' });
    await run({ collection: 'kali', idcc: '1486' });
    expect(calls.searchLegislation).toHaveLength(2);
  });

  it('rejects published_to before published_from', async () => {
    const { repo, calls } = fakeLegislation();
    const err = await createSearchLegislation(repo, { today })({
      collection: 'jorf',
      query: 'x',
      publishedFrom: '2016-12-31',
      publishedTo: '2016-01-01',
    }).catch((e) => e);
    expect(err).toMatchObject({ kind: 'invalid_input' });
    expect(err.message).toBe(
      '"published_to" (2016-01-01) is before "published_from" (2016-12-31).',
    );
    expect(calls.searchLegislation).toHaveLength(0);
  });

  it('names the tool parameters in its messages', async () => {
    const { repo } = fakeLegislation();
    const run = createSearchLegislation(repo, { today });
    const message = (input: Parameters<typeof run>[0]) =>
      run(input).then(
        () => '',
        (e: Error) => e.message,
      );
    expect(await message({ collection: 'codes', query: 'x', pageSize: 51 })).toBe(
      '"page_size" must be a whole number from 1 to 50, got 51.',
    );
    expect(await message({ collection: 'codes', query: 'x', pageSize: 0 })).toContain(
      '"page_size" must be a whole number from 1 to 50',
    );
    expect(await message({ collection: 'codes', query: 'x', page: 0 })).toContain(
      '"page" must be a whole number',
    );
    expect(await message({ collection: 'codes', query: 'x', atDate: '2020-13-01' })).toContain(
      '"at_date": "2020-13-01" is not a valid date',
    );
    expect(
      await message({ collection: 'jorf', query: 'x', publishedFrom: '2016-02-30' }),
    ).toContain('"published_from": "2016-02-30" is not a valid date');
  });

  it('rejects an unknown code with suggestions in the message', async () => {
    const { repo, calls } = fakeLegislation();
    const run = createSearchLegislation(repo, { today });
    const err = await run({ collection: 'codes', code: 'travail' }).catch((e) => e);
    expect(err).toMatchObject({ kind: 'invalid_input' });
    expect(err.message).toContain('Code du travail');
    expect(calls.searchLegislation).toHaveLength(0);
  });

  it('passes ctx down', async () => {
    const { repo, calls } = fakeLegislation();
    const ctx = { signal: new AbortController().signal };
    await createSearchLegislation(repo, { today })({ collection: 'codes' }, ctx);
    expect(calls.searchLegislation[0]?.ctx).toBe(ctx);
  });
});
