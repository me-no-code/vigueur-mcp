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
