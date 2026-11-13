import { describe, expect, it } from 'vitest';
import { createLegifranceClient } from '../../../src/clients/legifrance/client.js';
import { createGetText } from '../../../src/services/legislation/get-text.js';
import { fakePisteHttp } from '../../helpers/fake-piste-http.js';
import { textNumberSearch } from '../../helpers/fixture-fetch.js';

const LOLF = 'LEGITEXT000005631294';

// Production fixtures of décret 2005-1309 (repealed 2019-06-01): the in-force search lists two
// LEGITEXT containers of one cid, and reading either returns a body whose 2999 consolidated-version
// window and VIGUEUR-labelled art. 82 (2999 → 2999) must not make it look current.
// The LOLF (loi organique 2001-692): LODA files it under nature LOI (119), read today (120).
const fake = fakePisteHttp([
  {
    path: '/search',
    when: textNumberSearch('LODA_DATE', '2001-692'),
    fixture: '119-search-loda-date-num-2001-692',
  },
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
  {
    path: '/consult/lawDecree',
    when: (b) => (b as { textId: string }).textId === LOLF,
    fixture: '120-lawDecree-lolf-2001-692-today',
  },
  { path: '/consult/lawDecree', fixture: '116-lawDecree-decret-2005-1309-580-today' },
]);
const run = createGetText(createLegifranceClient(fake.http), { today: () => '2026-11-13' });

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

describe('getText over the real client (LOLF, loi organique 2001-692)', () => {
  it.each(['loi_organique', 'loi'] as const)(
    'nature %s + number 2001-692: the LOLF, searched as LOI, found',
    async (nature) => {
      const before = fake.calls.length;
      const r = await run({ nature, number: '2001-692' });
      expect(r.kind).toBe('found');
      if (r.kind !== 'found') return;
      expect(r.text.record.id).toBe(LOLF);
      expect(r.text.record.title).toBe(
        'Loi organique n° 2001-692 du 1 août 2001 relative aux lois de finances',
      );
      expect(r.text.warnings).toEqual([]);
      const sent = fake.calls.slice(before).map((c) => c.req);
      expect(sent.map((q) => q.path)).toEqual(['/search', '/consult/lawDecree']);
      expect(JSON.stringify(sent[0]?.body)).toContain('{"facette":"NATURE","valeurs":["LOI"]}');
    },
  );
});
