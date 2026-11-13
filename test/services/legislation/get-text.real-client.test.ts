import { describe, expect, it } from 'vitest';
import { createLegifranceClient } from '../../../src/clients/legifrance/client.js';
import { createGetText } from '../../../src/services/legislation/get-text.js';
import { fakePisteHttp } from '../../helpers/fake-piste-http.js';

// Production fixtures of décret 2005-1309 (repealed 2019-06-01): the in-force search lists two
// LEGITEXT containers of one cid, and reading either returns a body whose 2999 consolidated-version
// window and VIGUEUR-labelled art. 82 (2999 → 2999) must not make it look current.
const run = createGetText(
  createLegifranceClient(
    fakePisteHttp([
      { path: '/search', fixture: '114-search-loda-date-num-decret-2005-1309' },
      {
        path: '/consult/lawDecree',
        when: (b) => (b as { textId: string; date: string }).date === '2015-01-01',
        fixture: '118-lawDecree-decret-2005-1309-581-2015',
      },
      {
        path: '/consult/lawDecree',
        when: (b) => (b as { textId: string }).textId === 'LEGITEXT000006068624',
        fixture: '48-lawDecree-loi-78-17',
      },
      { path: '/consult/lawDecree', fixture: '116-lawDecree-decret-2005-1309-580-today' },
    ]).http,
  ),
  { today: () => '2026-11-13' },
);

describe('getText over the real client (décret 2005-1309)', () => {
  it('by number today: one text, not in force since 2019-06-01', async () => {
    const r = await run({ nature: 'decret', number: '2005-1309' });
    expect(r.kind).toBe('not_in_force');
    if (r.kind !== 'not_in_force') return;
    expect(r.candidates).toHaveLength(1);
    expect(r.candidates[0]).toMatchObject({ verdict: 'ended', on: '2019-06-01', nature: 'DECRET' });
  });

  it('by LEGITEXT id today: not in force, whichever container', async () => {
    for (const id of ['LEGITEXT000006052580', 'LEGITEXT000006052581']) {
      const r = await run({ id });
      expect(r).toMatchObject({ kind: 'not_in_force', candidates: [{ verdict: 'ended' }] });
    }
  });

  it('as of 2015-01-01 the same text is found', async () => {
    const r = await run({ id: 'LEGITEXT000006052581', atDate: '2015-01-01' });
    expect(r.kind).toBe('found');
  });

  it('loi 78-17 stays found', async () => {
    const r = await run({ id: 'LEGITEXT000006068624' });
    expect(r.kind).toBe('found');
  });
});
