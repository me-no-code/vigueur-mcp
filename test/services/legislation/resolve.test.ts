import { describe, expect, it } from 'vitest';
import type { ArticleHit } from '../../../src/services/legislation/ports.js';
import { latestPeriod } from '../../../src/services/legislation/resolve.js';

const hit = (id: string, validFrom: ArticleHit['validFrom']): ArticleHit => ({
  id,
  num: '1',
  codeId: 'LEGITEXT000006070721',
  codeTitle: 'Code civil',
  status: 'in_force',
  rawStatus: 'VIGUEUR',
  validFrom,
  validTo: null,
  validToUndetermined: false,
});

describe('latestPeriod', () => {
  it('never lets an undated hit win over a dated one', () => {
    const dated = hit('LEGIARTI000000000002', '2008-05-01');
    expect(latestPeriod([hit('LEGIARTI000000000001', null), dated])).toBe(dated);
    expect(latestPeriod([dated, hit('LEGIARTI000000000001', null)])).toBe(dated);
  });

  it('picks the greatest start among dated hits', () => {
    const newest = hit('LEGIARTI000000000003', '2020-01-01');
    expect(latestPeriod([hit('LEGIARTI000000000002', '2008-05-01'), newest])).toBe(newest);
  });
});
