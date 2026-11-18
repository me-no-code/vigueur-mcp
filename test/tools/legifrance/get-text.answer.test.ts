import { describe, expect, it } from 'vitest';
import type { GetTextInput, NotInForceText } from '../../../src/services/legislation/get-text.js';
import type { LegislationHit } from '../../../src/services/legislation/ports.js';
import { MAX_TOOL_TEXT } from '../../../src/tools/format.js';
import type { Answer } from '../../helpers/answer.js';
import {
  answer,
  article,
  articlesOf,
  DECRET_2000_1,
  foundText,
  LOI_2010_1,
  outlineOf,
  REQUEST,
  record,
  section,
  TODAY,
  withheld,
} from '../../helpers/get-text-builders.js';

const TOOL = 'legifrance_get_text';

const hit = (n: number, over: Partial<LegislationHit> = {}): LegislationHit => ({
  kind: 'text',
  id: `LEGITEXT00000000000${n}`,
  textId: `LEGITEXT00000000000${n}`,
  textCid: `JORFTEXT00000000000${n}`,
  title: `Décret n° 2000-1 du 1er janvier 2000 (${n})`,
  articleNumber: null,
  status: 'repealed',
  rawStatus: 'ABROGE',
  validFrom: null,
  validTo: null,
  snippet: null,
  nature: 'DECRET',
  publishedOn: '2000-01-02',
  nor: `ABCD000000${n}D`,
  ...over,
});

const candidate = (over: Partial<NotInForceText> = {}): NotInForceText => ({
  textId: 'LEGITEXT000000000001',
  textCid: 'JORFTEXT000000000001',
  title: 'Décret n° 2000-1 du 1er janvier 2000',
  nature: 'DECRET',
  nor: 'ABCD0000001D',
  publishedOn: '2000-01-02',
  verdict: 'ended',
  on: '2019-06-01',
  ...over,
});

const loda = (id: string) => `https://www.legifrance.gouv.fr/loda/id/${id}`;

const MORE = 'Légifrance lists more matches than shown; refine with nature or a Légifrance id.';

describe('buildGetTextAnswer: texts that are not found, ambiguous or not in force', () => {
  it('ambiguous: each text with its id, link and the call that reads it; how to pick; no status labels', () => {
    const a = answer(
      { kind: 'ambiguous', candidates: [hit(1), hit(2)], more: false },
      'several_matches',
      { input: DECRET_2000_1 },
    );
    expect(a.asked).toBe('décret 2000-1');
    expect(a.warnings).toEqual([
      'Several texts match décret 2000-1.',
      'Call again with the "id" of the text you mean.',
    ]);
    expect(a.candidates).toEqual(
      [1, 2].map((n) => {
        const id = `LEGITEXT00000000000${n}`;
        return {
          title: `Décret n° 2000-1 du 1er janvier 2000 (${n})`,
          nature: 'DECRET',
          nor: `ABCD000000${n}D`,
          published: '2000-01-02',
          id,
          link: loda(id),
          read_with: { tool: TOOL, id, at_date: TODAY },
        };
      }),
    );
    expect(a.incomplete).toBe(false);
  });

  it('ambiguous with more matches says so; the call that reads a candidate keeps the date asked', () => {
    const a = answer(
      { kind: 'ambiguous', candidates: [hit(1), hit(2)], more: true },
      'several_matches',
      { input: { ...LOI_2010_1, atDate: '2015-01-01' } },
    );
    expect(a.warnings).toContain(MORE);
    expect(a.incomplete).toBe(true);
    expect(a.candidates[0].read_with).toEqual({
      tool: TOOL,
      id: 'LEGITEXT000000000001',
      at_date: '2015-01-01',
    });
  });

  it('not in force: each verdict as a value, ids and links, the hint, no sentinel date', () => {
    const a = answer(
      {
        kind: 'not_in_force',
        input: 'decret 2000-1',
        asOf: TODAY,
        candidates: [
          candidate(),
          candidate({ textId: 'LEGITEXT000000000002', on: null }),
          candidate({ textId: 'LEGITEXT000000000003', verdict: 'not_yet', on: '2027-01-01' }),
          candidate({
            textId: 'JORFTEXT000000000004',
            verdict: 'undetermined',
            on: null,
            nor: null,
          }),
        ],
        more: false,
      },
      'not_in_force',
      { input: DECRET_2000_1 },
    );
    expect(a.warnings).toEqual([
      'No décret 2000-1 in force on 2026-11-12.',
      'To read it, pass its id with an at_date inside its validity.',
    ]);
    expect(a.asked).toBe('décret 2000-1');
    expect(a.on).toBe(TODAY);
    const base = {
      title: 'Décret n° 2000-1 du 1er janvier 2000',
      nature: 'DECRET',
      nor: 'ABCD0000001D',
      published: '2000-01-02',
    };
    expect(a.candidates).toEqual([
      {
        ...base,
        id: 'LEGITEXT000000000001',
        link: loda('LEGITEXT000000000001'),
        verdict: 'ended',
        verdict_date: '2019-06-01',
      },
      {
        ...base,
        id: 'LEGITEXT000000000002',
        link: loda('LEGITEXT000000000002'),
        verdict: 'ended',
        verdict_date: null,
      },
      {
        ...base,
        id: 'LEGITEXT000000000003',
        link: loda('LEGITEXT000000000003'),
        verdict: 'not_yet',
        verdict_date: '2027-01-01',
      },
      {
        ...base,
        nor: null,
        id: 'JORFTEXT000000000004',
        link: 'https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000000000004',
        verdict: 'undetermined',
        verdict_date: null,
      },
    ]);
    expect(a.incomplete).toBe(false);
  });

  it('no version on the date: says so, no date invented', () => {
    const a = answer(
      {
        kind: 'not_in_force',
        input: 'LEGITEXT000000000001',
        asOf: '1970-01-01',
        candidates: [candidate({ verdict: 'no_version', on: null })],
        more: false,
      },
      'not_in_force',
      { input: { id: 'LEGITEXT000000000001', atDate: '1970-01-01' } },
    );
    expect(a.warnings).toEqual([
      'No text LEGITEXT000000000001 in force on 1970-01-01.',
      'To read it, pass its id with an at_date inside its validity.',
    ]);
    expect(a.asked).toBe('text LEGITEXT000000000001');
    expect(a.on).toBe('1970-01-01');
    expect(a.candidates).toEqual([
      {
        title: 'Décret n° 2000-1 du 1er janvier 2000',
        nature: 'DECRET',
        nor: 'ABCD0000001D',
        published: '2000-01-02',
        id: 'LEGITEXT000000000001',
        link: loda('LEGITEXT000000000001'),
        verdict: 'no_version',
        verdict_date: null,
      },
    ]);
  });

  it('every candidate undetermined: Légifrance gives no in-force dates, not "no text in force"', () => {
    const undetermined = candidate({ verdict: 'undetermined', on: null });
    const a = answer(
      {
        kind: 'not_in_force',
        input: 'decret 2000-1',
        asOf: TODAY,
        candidates: [undetermined, { ...undetermined, textId: 'LEGITEXT000000000002' }],
        more: false,
      },
      'not_in_force',
      { input: DECRET_2000_1 },
    );
    expect(a.warnings[0]).toBe(
      'Légifrance gives no in-force dates for décret 2000-1 on 2026-11-12.',
    );
    expect(a.warnings).not.toContain('No décret 2000-1 in force on 2026-11-12.');
    expect(a.candidates.map((c: Answer) => c.verdict)).toEqual(['undetermined', 'undetermined']);
    const mixed = answer(
      {
        kind: 'not_in_force',
        input: 'decret 2000-1',
        asOf: TODAY,
        candidates: [undetermined, candidate({ textId: 'LEGITEXT000000000002' })],
        more: false,
      },
      'not_in_force',
      { input: DECRET_2000_1 },
    );
    expect(mixed.warnings[0]).toBe('No décret 2000-1 in force on 2026-11-12.');
  });

  it('another nature: the texts carrying the number, with ids, links and the call that reads each', () => {
    const a = answer(
      {
        kind: 'other_nature',
        input: 'loi 2000-1',
        number: '2000-1',
        candidates: [hit(1), hit(2, { nor: null, publishedOn: null })],
        more: false,
      },
      'not_found',
      { input: { nature: 'loi', number: '2000-1' } },
    );
    expect(a.reason).toBe('other_nature');
    expect(a.asked).toBe('loi 2000-1');
    expect(a.warnings).toEqual([
      'Légifrance files no loi numbered 2000-1; these texts carry that number.',
      'Pass one of these ids to read it.',
    ]);
    expect(a.candidates).toEqual([
      {
        title: 'Décret n° 2000-1 du 1er janvier 2000 (1)',
        nature: 'DECRET',
        nor: 'ABCD0000001D',
        published: '2000-01-02',
        id: 'LEGITEXT000000000001',
        link: loda('LEGITEXT000000000001'),
        read_with: { tool: TOOL, id: 'LEGITEXT000000000001', at_date: TODAY },
      },
      {
        title: 'Décret n° 2000-1 du 1er janvier 2000 (2)',
        nature: 'DECRET',
        nor: null,
        published: null,
        id: 'LEGITEXT000000000002',
        link: loda('LEGITEXT000000000002'),
        read_with: { tool: TOOL, id: 'LEGITEXT000000000002', at_date: TODAY },
      },
    ]);
    expect(a.incomplete).toBe(false);
  });

  it('another nature with more matches says so', () => {
    const a = answer(
      {
        kind: 'other_nature',
        input: 'loi organique 2000-1',
        number: '2000-1',
        candidates: [hit(1)],
        more: true,
      },
      'not_found',
      { input: { nature: 'loi_organique', number: '2000-1' } },
    );
    expect(a.warnings).toEqual([
      'Légifrance files no loi organique numbered 2000-1; these texts carry that number.',
      MORE,
      'Pass one of these ids to read it.',
    ]);
    expect(a.incomplete).toBe(true);
  });

  it('not in force with more matches says so', () => {
    const a = answer(
      {
        kind: 'not_in_force',
        input: 'loi 2010-1',
        asOf: TODAY,
        candidates: [candidate()],
        more: true,
      },
      'not_in_force',
    );
    expect(a.warnings).toContain(MORE);
    expect(a.incomplete).toBe(true);
  });

  it('not found echoes what was asked', () => {
    const notFound = (input: GetTextInput, echo: string) =>
      answer({ kind: 'not_found', input: echo }, 'not_found', { input });
    const loi = notFound(LOI_2010_1, 'loi 2010-1');
    expect(loi.reason).toBe('no_text');
    expect(loi.asked).toBe('loi 2010-1');
    expect(loi.candidates).toEqual([]);
    expect(loi.incomplete).toBe(false);
    expect(loi.warnings).toEqual([
      'No loi 2010-1 on Légifrance, in force or not. Check it, or search with legifrance_search_legislation.',
    ]);
    expect(notFound({ nor: 'ABCD0000001D' }, 'ABCD0000001D').warnings).toEqual([
      'No text with NOR ABCD0000001D on Légifrance. Check it, or search with legifrance_search_legislation.',
    ]);
    expect(notFound({ id: 'LEGITEXT000000000009' }, 'LEGITEXT000000000009').warnings).toEqual([
      'No text LEGITEXT000000000009 on Légifrance. Check it, or search with legifrance_search_legislation.',
    ]);
    expect(
      notFound({ nature: 'loi_organique', number: '2001-692' }, 'loi organique 2001-692')
        .warnings[0],
    ).toContain('No loi organique 2001-692 on Légifrance, in force or not.');
    const arrete = notFound({ nature: 'arrete', number: '1' }, 'arrete 1');
    expect(arrete.asked).toBe('arrêté 1');
    expect(arrete.warnings[0]).toContain('No arrêté 1 on Légifrance');
  });
});

describe('buildGetTextAnswer: a found text', () => {
  const warning =
    "Légifrance's in-force search did not return this text; its dates say it is in force on 2026-11-12.";

  it('outline: every field in order, sections with counts and ids, the call that reads the articles', () => {
    const r = record({
      articles: [article(1)],
      sections: [
        section('LEGISCTA000000000010', 'Titre Ier', {
          articles: [article(2), article(3, { validTo: '2020-01-01', status: 'repealed' })],
          sections: [section('LEGISCTA000000000011', 'Chapitre Ier', { articles: [article(4)] })],
        }),
      ],
    });
    const a = outlineOf(foundText(r, [warning]));
    expect(Object.keys(a)).toEqual([
      'source',
      'outcome',
      'warnings',
      'id',
      'text_cid',
      'title',
      'nature',
      'legifrance_status',
      'nor',
      'published',
      'journal',
      'signed',
      'version',
      'on',
      'link',
      'section',
      'part',
      'article_count',
      'in_force_count',
      'outside_sections_count',
      'results',
      'page',
      'next',
      'items',
      'read_with',
      'request',
      'retrieved',
      'cached',
      'vigueur_version',
    ]);
    expect(a).toMatchObject({
      // The outline hint is now `read_with`: only the service's warning is left.
      warnings: [warning],
      id: 'LEGITEXT000000000001',
      text_cid: 'JORFTEXT000000000001',
      title: 'Loi n° 2010-1 du 1er janvier 2010 de test',
      nature: 'LOI',
      legifrance_status: 'Vigueur',
      nor: null,
      published: '2010-01-02',
      journal: null,
      signed: null,
      version: 'consolidated',
      on: TODAY,
      link: loda('LEGITEXT000000000001'),
      section: null,
      part: 'outline',
      article_count: 4,
      in_force_count: 3,
      outside_sections_count: 1,
      results: 2,
      page: { number: 1, of: 1 },
      next: null,
      read_with: { tool: TOOL, id: 'LEGITEXT000000000001', at_date: TODAY, part: 'articles' },
      request: REQUEST,
      cached: [],
    });
    expect(a.items).toEqual([
      {
        type: 'section',
        title: 'Titre Ier',
        section_id: 'LEGISCTA000000000010',
        depth: 0,
        articles: 3,
        in_force: 2,
      },
      {
        type: 'section',
        title: 'Chapitre Ier',
        section_id: 'LEGISCTA000000000011',
        depth: 1,
        articles: 1,
        in_force: 1,
      },
    ]);
  });

  it('the signature date, when Légifrance gives one', () => {
    const a = outlineOf(foundText(record({ signedOn: '2009-12-31' })));
    expect(a.signed).toBe('2009-12-31');
  });

  it('articles: each with its section path, number, id, status and text', () => {
    const r = record({
      articles: [article(1)],
      sections: [section('LEGISCTA000000000010', 'Titre Ier', { articles: [article(2)] })],
    });
    const a = articlesOf(foundText(r));
    const inForce = {
      state: 'in_force',
      on: TODAY,
      from: '2010-01-01',
      until: null,
      until_undetermined: false,
    };
    expect(a.items).toEqual([
      {
        type: 'article',
        section: [],
        number: '1',
        id: 'LEGIARTI000000000001',
        slice: null,
        status: inForce,
        legifrance_status: 'VIGUEUR',
        text: "Texte de l'article 1.",
      },
      {
        type: 'article',
        section: ['Titre Ier'],
        number: '2',
        id: 'LEGIARTI000000000002',
        slice: null,
        status: inForce,
        legifrance_status: 'VIGUEUR',
        text: "Texte de l'article 2.",
      },
    ]);
    expect(a).toMatchObject({
      part: 'articles',
      article_count: 2,
      in_force_count: 2,
      outside_sections_count: 1,
      results: 2,
      page: { number: 1, of: 1 },
      next: null,
      read_with: null,
      warnings: [],
    });
  });

  it('articles of a long text: bounded pages, a long article split in slices, text intact', () => {
    // Dense in characters JSON escapes: quotes, backslashes and line breaks.
    const long = Array.from(
      { length: 2500 },
      (_, i) => `Alinéa ${i} : « texte "officiel" \\ de l'article long.`,
    ).join('\n');
    const small = Array.from({ length: 300 }, (_, i) =>
      article(i + 10, { text: `Article court ${i}. `.repeat(40) }),
    );
    const r = record({
      sections: [
        section('LEGISCTA000000000010', 'Titre Ier', { articles: small.slice(0, 150) }),
        section('LEGISCTA000000000020', 'Titre II', {
          articles: [article(1, { num: '1 bis', text: long }), ...small.slice(150)],
        }),
      ],
    });
    expect(long.length).toBeGreaterThan(100_000);
    const found = foundText(r, [warning]);
    const first = articlesOf(found);
    const pageCount = first.page.of;
    expect(pageCount).toBeGreaterThan(3);
    const pages = Array.from({ length: pageCount }, (_, i) => articlesOf(found, i + 1));
    const items = pages.flatMap((p) => p.items);
    for (const [i, page] of pages.entries()) {
      // expectAnswer bounded each page by MAX_TOOL_TEXT.
      expect(page.title).toBe('Loi n° 2010-1 du 1er janvier 2010 de test');
      expect(page.warnings).toEqual([warning]);
      expect(page.page).toEqual({ number: i + 1, of: pageCount });
      expect(page.next).toEqual(i + 1 < pageCount ? { page: i + 2 } : null);
      expect(page.link).toBe(loda('LEGITEXT000000000001'));
      expect(page.results).toBe(items.length);
      expect(page.article_count).toBe(301);
      // Every article says which section holds it.
      for (const item of page.items) expect(item.section.length).toBe(1);
    }
    // The budget is used: pages holding a slice of the long article are near the cap.
    expect(Math.max(...pages.map((p) => JSON.stringify(p).length))).toBeGreaterThan(
      MAX_TOOL_TEXT - 2_000,
    );
    const parts = items.filter((i: Answer) => i.number === '1 bis');
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.map((i: Answer) => i.slice)).toEqual(
      parts.map((_: Answer, k: number) => ({ index: k + 1, of: parts.length })),
    );
    expect(parts.map((i: Answer) => i.text).join('')).toBe(long);
    const whole = items.filter((i: Answer) => /^\d+$/.test(i.number));
    expect(whole).toHaveLength(300);
    expect(whole.every((i: Answer) => i.slice === null)).toBe(true);
  });

  it('a page past the end: no_results, the same fields, no items', () => {
    const found = foundText(record({ articles: [article(1)] }));
    const last = articlesOf(found);
    const past = answer(found, 'no_results', { part: 'articles', page: 99 });
    expect(Object.keys(past)).toEqual(Object.keys(last));
    expect(past.items).toEqual([]);
    expect(past.page).toEqual({ number: 99, of: 1 });
    expect(past.next).toBeNull();
    expect(past.results).toBe(1);
    const outlinePast = answer(found, 'no_results', { page: 99 });
    expect(outlinePast.items).toEqual([]);
    expect(outlinePast.page).toEqual({ number: 99, of: 1 });
  });

  it('an article not in force on the date: its status, no text, and why', () => {
    const r = record({
      articles: [article(1, { status: 'repealed', rawStatus: 'ABROGE', validTo: '2020-01-01' })],
    });
    const a = articlesOf(foundText(r));
    expect(a.items).toEqual([
      {
        type: 'article',
        section: [],
        number: '1',
        id: 'LEGIARTI000000000001',
        slice: null,
        status: {
          state: 'not_in_force',
          on: TODAY,
          from: '2010-01-01',
          until: '2020-01-01',
          until_undetermined: false,
        },
        legifrance_status: 'ABROGE',
        text: null,
      },
    ]);
    expect(a.warnings).toEqual([withheld(TODAY)]);
    expect(a.in_force_count).toBe(0);
  });

  it('an article with no in-force dates: its text, no status, not counted', () => {
    const r = record({
      articles: [
        article(1),
        article(82, {
          validFrom: null,
          validTo: null,
          text: 'a modifié les dispositions suivantes',
        }),
      ],
    });
    const a = articlesOf(foundText(r));
    expect(a.items[1]).toEqual({
      type: 'article',
      section: [],
      number: '82',
      id: 'LEGIARTI000000000082',
      slice: null,
      status: null,
      legifrance_status: 'VIGUEUR',
      text: 'a modifié les dispositions suivantes',
    });
    expect(a.article_count).toBe(2);
    expect(a.in_force_count).toBe(1);
    expect(a.items.filter((i: Answer) => i.status?.state === 'in_force')).toHaveLength(1);
    expect(a.warnings).toEqual([]);
    expect(outlineOf(foundText(r)).in_force_count).toBe(1);
  });

  it('an article with no start date but an end before the date: ended, text withheld', () => {
    const r = record({
      articles: [article(1, { validFrom: null, validTo: '2020-01-01', rawStatus: 'ABROGE' })],
    });
    const [item] = articlesOf(foundText(r)).items;
    expect(item.status).toEqual({
      state: 'not_in_force',
      on: TODAY,
      from: null,
      until: '2020-01-01',
      until_undetermined: false,
    });
    expect(item.legifrance_status).toBe('ABROGE');
    expect(item.text).toBeNull();
  });

  it('an article whose end Légifrance has not dated, and one with no text', () => {
    const r = record({
      articles: [article(1, { validToUndetermined: true }), article(2, { text: '' })],
    });
    const [undetermined, empty] = articlesOf(foundText(r)).items;
    expect(undetermined.status.until_undetermined).toBe(true);
    expect(empty.text).toBe('');
  });

  it('a JORF text: as published, no in-force claim on its articles', () => {
    const r = record({
      id: 'JORFTEXT000000000001',
      nature: 'DECRET',
      jurisState: 'Sans état juridique',
      nor: 'ABCD0000001D',
      jorfLabel: 'JORF n°0001 du 2 janvier 2010',
      articles: [article(1, { id: 'JORFARTI000000000001', validFrom: null })],
    });
    const found = foundText(r);
    if (found.kind === 'found')
      found.text.url = 'https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000000000001';
    const a = articlesOf(found);
    expect(a).toMatchObject({
      nature: 'DECRET',
      legifrance_status: 'Sans état juridique',
      nor: 'ABCD0000001D',
      published: '2010-01-02',
      journal: 'JORF n°0001 du 2 janvier 2010',
      version: 'as_published',
      link: 'https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000000000001',
      article_count: 1,
      in_force_count: null,
      results: 1,
      page: { number: 1, of: 1 },
    });
    expect(a.items).toEqual([
      {
        type: 'article',
        section: [],
        number: '1',
        id: 'JORFARTI000000000001',
        slice: null,
        status: null,
        legifrance_status: null,
        text: "Texte de l'article 1.",
      },
    ]);
    const outline = outlineOf(found);
    expect(outline.in_force_count).toBeNull();
    expect(outline.read_with).toEqual({
      tool: TOOL,
      id: 'JORFTEXT000000000001',
      part: 'articles',
    });
  });
});
