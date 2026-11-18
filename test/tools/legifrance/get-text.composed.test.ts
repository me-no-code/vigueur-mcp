import { describe, expect, it } from 'vitest';
import { MAX_TOOL_TEXT, sliceForJson } from '../../../src/tools/format.js';
import { expectAnswer, expectToolError } from '../../helpers/answer.js';
import { type McpTestClient, readAllPages, useServers } from '../../helpers/composed-server.js';
import {
  article,
  articlesOf,
  foundText,
  record,
  withheld,
} from '../../helpers/get-text-builders.js';

const TOOL = 'legifrance_get_text';
const SOURCE = 'Légifrance';
const FOUND = { source: SOURCE, outcome: 'found' };
const NO_RESULTS = { source: SOURCE, outcome: 'no_results' };
const NOT_IN_FORCE = { source: SOURCE, outcome: 'not_in_force' };
const NOT_FOUND = { source: SOURCE, outcome: 'not_found' };
const DATE = /^\d{4}-\d\d-\d\d$/;

type Answer = ReturnType<typeof expectAnswer>;

const { composed } = useServers();

type Client = McpTestClient;

async function call(args: Record<string, unknown>) {
  const client = await composed();
  return client.callTool({ name: TOOL, arguments: args });
}

/** Every page of the articles, from the first; each page's `next.page` is the page after it. */
async function readTextPages(client: Client, args: Record<string, unknown>): Promise<Answer[]> {
  const pages = await readAllPages(client, TOOL, args, FOUND);
  for (const [i, p] of pages.slice(0, -1).entries()) expect(p.next.page).toBe(i + 2);
  return pages;
}

const LOI_78_17 =
  "Loi n° 78-17 du 6 janvier 1978 relative à l'informatique, aux fichiers et aux libertés";
const LOI_78_17_ID = 'LEGITEXT000006068624';
const LOI_78_17_LINK = 'https://www.legifrance.gouv.fr/loda/id/LEGITEXT000006068624';
const ORD_2016_131 =
  'Ordonnance n° 2016-131 du 10 février 2016 portant réforme du droit des contrats, du régime général et de la preuve des obligations';
const ORD_2016_131_ID = 'JORFTEXT000032004939';
const ORD_2016_131_LINK = 'https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000032004939';

// First in this file, like the get_article and get_decision guards: Node 26.5 (V8 Maglev) gave a
// long last slice a next offset at the text's end while `sliceForJson` had been compiled on short
// texts only. Slicing an article starts with a cut slice, so get_text did not show it; this pins
// that its slices still rebuild the text.
describe('an article split in slices, read after short texts', () => {
  it('its slices rebuild the text, none empty, on every read', () => {
    for (let i = 0; i < 10; i++) sliceForJson('Texte officiel.', 0, 39_000);
    const long = 'Alinéa : texte "officiel" de l\'article.\n'.repeat(1_500);
    expect(long.length).toBeGreaterThan(MAX_TOOL_TEXT);
    const found = foundText(record({ articles: [article(1, { text: long })] }));
    for (let n = 0; n < 6; n++) {
      const pageCount = articlesOf(found).page.of;
      const parts = Array.from({ length: pageCount }, (_, i) => articlesOf(found, i + 1)).flatMap(
        (p) => p.items,
      );
      expect(parts.length, `read ${n + 1}`).toBeGreaterThan(1);
      expect(parts.map((i: Answer) => i.slice)).toEqual(
        parts.map((_: Answer, k: number) => ({ index: k + 1, of: parts.length })),
      );
      expect(parts.every((i: Answer) => i.text.length > 0)).toBe(true);
      expect(parts.map((i: Answer) => i.text).join('') === long).toBe(true);
    }
  });
});

describe('legifrance_get_text over the composed server (fixtures)', () => {
  it('loi 78-17 by nature + number: outline with its sections, publication and link', async () => {
    const a = expectAnswer(await call({ nature: 'loi', number: '78-17' }), FOUND);
    expect(a.id).toBe(LOI_78_17_ID);
    expect(a.title).toBe(LOI_78_17);
    expect(a.nature).toBe('LOI');
    expect(a.legifrance_status).toBe('Vigueur');
    expect(a.published).toBe('1978-01-07');
    // Today's "(Journal officiel publication date)": Légifrance names no issue.
    expect(a.journal).toBeNull();
    // Fixture 48 carries no signature date (dateTexte null).
    expect(a.signed).toBeNull();
    expect(a.version).toBe('consolidated');
    expect(a.on).toMatch(DATE);
    expect(a.on).toBe(a.request.at_date);
    expect(a.link).toBe(LOI_78_17_LINK);
    expect(a.section).toBeNull();
    expect(a.part).toBe('outline');
    expect(a.items).toContainEqual({
      type: 'section',
      title: 'Titre Ier : Dispositions communes',
      section_id: 'LEGISCTA000037802702',
      depth: 0,
      articles: 52,
      in_force: expect.any(Number),
    });
    expect(a.items).toContainEqual({
      type: 'section',
      title: 'Chapitre Ier : Principes et définitions',
      section_id: 'LEGISCTA000006095881',
      depth: 1,
      articles: 8,
      in_force: expect.any(Number),
    });
    // The outline holds no article texts.
    expect(a.items.every((i: Answer) => i.type === 'section')).toBe(true);
    expect(a.read_with).toEqual({ tool: TOOL, id: LOI_78_17_ID, at_date: a.on, part: 'articles' });
    expect(a.warnings).toEqual([]);
    expect(a.request).toEqual({
      tool: TOOL,
      nature: 'loi',
      number: '78-17',
      at_date: expect.stringMatching(DATE),
      part: 'outline',
      page: 1,
    });
  });

  it('loi "n° 78-17": the "n°" typed with the number is not part of it', async () => {
    const a = expectAnswer(await call({ nature: 'loi', number: 'n° 78-17' }), FOUND);
    expect(a.title).toBe(LOI_78_17);
    expect(a.link).toBe(LOI_78_17_LINK);
  });

  it('loi 78-17 articles: bounded pages, each with the text fields and the link, every article once', async () => {
    const client = await composed();
    const pages = await readTextPages(client, { nature: 'loi', number: '78-17', part: 'articles' });
    expect(pages.length).toBeGreaterThan(1);
    const [first, second] = pages as [Answer, Answer];
    const art1 = first.items.find((i: Answer) => i.number === '1');
    expect(art1?.text).toContain("L'informatique doit être au service de chaque citoyen.");
    expect(first.next).toEqual({ page: 2 });
    expect(second.title).toBe(LOI_78_17);
    expect(second.link).toBe(LOI_78_17_LINK);
    for (const [i, page] of pages.entries()) {
      // expectAnswer bounded each page by MAX_TOOL_TEXT.
      expect(page.title).toBe(LOI_78_17);
      expect(page.id).toBe(LOI_78_17_ID);
      expect(page.link).toBe(LOI_78_17_LINK);
      expect(page.version).toBe('consolidated');
      expect(page.on).toMatch(DATE);
      expect(page.part).toBe('articles');
      expect(page.page).toEqual({ number: i + 1, of: pages.length });
      expect(page.article_count).toBe(187);
      expect(page.results).toBe(187);
      expect(page.read_with).toBeNull();
    }
    expect(pages.at(-1)?.next).toBeNull();
    const items = pages.flatMap((p) => p.items);
    expect(items).toHaveLength(187);
    expect(items.every((i: Answer) => i.type === 'article' && i.slice === null)).toBe(true);
    // Numbers repeat (old repealed chapters reused 32, 43…): each article is told by its id.
    const ids = items.map((i: Answer) => i.id);
    expect(ids.every((id: string) => /^LEGIARTI\d{12}$/.test(id))).toBe(true);
    expect(new Set(ids).size).toBe(187);
  });

  it('an article not in force on the date: its status, its text withheld', async () => {
    const client = await composed();
    const pages = await readTextPages(client, { nature: 'loi', number: '78-17', part: 'articles' });
    const on = pages[0]?.on;
    const holding = pages.find((p) => p.items.some((i: Answer) => i.id === 'LEGIARTI000037088068'));
    const art51 = holding?.items.find((i: Answer) => i.id === 'LEGIARTI000037088068');
    expect(art51).toEqual({
      type: 'article',
      section: expect.any(Array),
      number: '5-1',
      id: 'LEGIARTI000037088068',
      slice: null,
      status: {
        state: 'not_in_force',
        on,
        from: '2018-05-25',
        until: '2019-06-01',
        until_undetermined: false,
      },
      legifrance_status: 'ABROGE',
      text: null,
    });
    expect(holding?.warnings).toContain(withheld(on));
    const art1 = pages.flatMap((p) => p.items).find((i: Answer) => i.id === 'LEGIARTI000037822962');
    expect(art1).toMatchObject({
      number: '1',
      status: {
        state: 'in_force',
        on,
        from: '2019-06-01',
        until: null,
        until_undetermined: false,
      },
      legifrance_status: 'VIGUEUR',
    });
    expect(art1?.text).toContain("L'informatique doit être au service de chaque citoyen.");
  });

  it('one section: its outline, then only its articles, with the section path', async () => {
    const path = ['Titre Ier : Dispositions communes', 'Chapitre Ier : Principes et définitions'];
    const outline = expectAnswer(
      await call({ nature: 'loi', number: '78-17', section_id: 'LEGISCTA000006095881' }),
      FOUND,
    );
    expect(outline.section).toEqual({ path, section_id: 'LEGISCTA000006095881' });
    expect(JSON.stringify(outline)).not.toContain('Titre II');
    expect(outline.article_count).toBe(8);
    expect(outline.read_with).toEqual({
      tool: TOOL,
      id: LOI_78_17_ID,
      at_date: outline.on,
      section_id: 'LEGISCTA000006095881',
      part: 'articles',
    });

    const client = await composed();
    const pages = await readTextPages(client, {
      nature: 'loi',
      number: '78-17',
      section_id: 'LEGISCTA000006095881',
      part: 'articles',
    });
    expect(pages).toHaveLength(1);
    expect(pages[0]?.section).toEqual({ path, section_id: 'LEGISCTA000006095881' });
    expect(pages[0]?.items).toHaveLength(8);
    for (const item of pages[0]?.items ?? []) {
      expect(item.type).toBe('article');
      expect(item.section.slice(0, 2)).toEqual(path);
    }
  });

  it('an unknown section_id is an error naming the section_id parameter', async () => {
    const e = expectToolError(
      await call({ nature: 'loi', number: '78-17', section_id: 'LEGISCTA000000000000' }),
      'invalid_input',
    );
    expect(e.error.message).toContain('"LEGISCTA000000000000"');
    expect(e.error.message).toContain('Omit "section_id" to read the whole text.');
    expect(e.request.section_id).toBe('LEGISCTA000000000000');
  });

  it('by NOR: the ordonnance as published in the Journal officiel, with its publication and signature', async () => {
    const a = expectAnswer(await call({ nor: 'JUSC1522466R' }), FOUND);
    expect(a.id).toBe(ORD_2016_131_ID);
    expect(a.title).toBe(ORD_2016_131);
    expect(a.nature).toBe('ORDONNANCE');
    expect(a.legifrance_status).toBe('Sans état juridique');
    expect(a.nor).toBe('JUSC1522466R');
    expect(a.published).toBe('2016-02-11');
    expect(a.journal).toBe('JORF n°0035 du 11 février 2016');
    // Fixtures 40 and 50 carry the signature date (dateTexte); fixture 48 (loi 78-17) does not.
    expect(a.signed).toBe('2016-02-10');
    expect(a.version).toBe('as_published');
    expect(a.in_force_count).toBeNull();
    expect(a.items).toContainEqual({
      type: 'section',
      title: 'Titre IER : DISPOSITIONS RELATIVES AU LIVRE III DU CODE CIVIL',
      section_id: 'JORFSCTA000032004942',
      depth: 0,
      articles: 4,
      in_force: null,
    });
    expect(a.link).toBe(ORD_2016_131_LINK);
    expect(a.read_with).toEqual({ tool: TOOL, id: ORD_2016_131_ID, part: 'articles' });
    // Read as published: no at_date default.
    expect(a.request).toEqual({ tool: TOOL, nor: 'JUSC1522466R', part: 'outline', page: 1 });
  });

  it('by NOR, articles: a 62 000-character article is split over bounded pages', async () => {
    const client = await composed();
    const pages = await readTextPages(client, { nor: 'JUSC1522466R', part: 'articles' });
    const items = pages.flatMap((p) => p.items);
    for (const page of pages) {
      expect(page.title).toBe(ORD_2016_131);
      expect(page.published).toBe('2016-02-11');
      expect(page.link).toBe(ORD_2016_131_LINK);
      expect(page.version).toBe('as_published');
      expect(page.in_force_count).toBeNull();
      expect(page.results).toBe(items.length);
    }
    const art2 = items.filter((i: Answer) => i.id === 'JORFARTI000032005157');
    expect(art2.length).toBeGreaterThanOrEqual(2);
    expect(art2.map((i: Answer) => i.slice)).toEqual(
      art2.map((_: Answer, k: number) => ({ index: k + 1, of: art2.length })),
    );
    expect(art2[0]?.number).toBe('2');
    const text = art2.map((i: Answer) => i.text).join('');
    expect(text.length).toBeGreaterThan(60_000);
    expect(text).toContain("Le titre III est ainsi rédigé :\n« Titre III\n« DES SOURCES D'");
    expect(text).toContain('demnité due est égale à la plus forte de ces deux valeurs. »');
    // As published: no in-force claim on any article.
    for (const item of items) {
      expect(item.status).toBeNull();
      expect(item.legifrance_status).toBeNull();
    }
  });

  it('by JORFTEXT id: read as published', async () => {
    const a = expectAnswer(await call({ id: ORD_2016_131_ID }), FOUND);
    expect(a.title).toBe(ORD_2016_131);
    expect(a.published).toBe('2016-02-11');
    expect(a.journal).toBe('JORF n°0035 du 11 février 2016');
    expect(a.version).toBe('as_published');
    expect(a.link).toBe(ORD_2016_131_LINK);
    expect(a.request).toEqual({ tool: TOOL, id: ORD_2016_131_ID, part: 'outline', page: 1 });
  });

  it('a collective agreement id is refused, pointing to legifrance_search_legislation', async () => {
    const e = expectToolError(await call({ id: 'KALITEXT000005635221' }), 'invalid_input');
    expect(e.error.message).toContain('legifrance_search_legislation');
  });

  it('an unknown text id (Légifrance HTTP 400) is a miss echoing the id, not an error', async () => {
    const a = expectAnswer(await call({ id: 'LEGITEXT999999999999' }), NOT_FOUND);
    expect(a.reason).toBe('no_text');
    expect(a.asked).toBe('text LEGITEXT999999999999');
    expect(a.candidates).toEqual([]);
    expect(a.incomplete).toBe(false);
    expect(a.warnings).toEqual([
      'No text LEGITEXT999999999999 on Légifrance. Check it, or search with legifrance_search_legislation.',
    ]);
  });

  it('décret 2005-1309 today: not in force, listed with when it ceased, never shown as law', async () => {
    const a = expectAnswer(await call({ nature: 'decret', number: '2005-1309' }), NOT_IN_FORCE);
    expect(a.warnings[0]).toMatch(/^No décret 2005-1309 in force on \d{4}-\d{2}-\d{2}\.$/);
    expect(a.warnings).toContain('To read it, pass its id with an at_date inside its validity.');
    expect(a.asked).toBe('décret 2005-1309');
    expect(a.on).toBe(a.request.at_date);
    expect(a.candidates).toContainEqual({
      title: expect.stringContaining('Décret n°2005-1309 du 20 octobre 2005'),
      nature: 'DECRET',
      nor: 'JUSC0520586D',
      published: '2005-10-22',
      id: expect.stringMatching(/^LEGITEXT00000605258[01]$/),
      link: expect.any(String),
      verdict: 'ended',
      verdict_date: '2019-06-01',
    });
    for (const c of a.candidates) {
      expect(c.link).toBe(`https://www.legifrance.gouv.fr/loda/id/${c.id}`);
    }
    // No article, no text body, no sentinel date.
    expect(a).not.toHaveProperty('items');
    expect(JSON.stringify(a)).not.toContain('Les membres de la Commission nationale');
    expect(JSON.stringify(a.candidates)).not.toMatch(/2999|2222/);
  });

  it('loi organique 2001-692 (LOLF): found although LODA files it as LOI', async () => {
    const a = expectAnswer(await call({ nature: 'loi_organique', number: '2001-692' }), FOUND);
    expect(a.title).toBe('Loi organique n° 2001-692 du 1 août 2001 relative aux lois de finances');
    expect(a.nature).toBe('LOI');
    expect(a.legifrance_status).toBe('Vigueur');
    expect(a.nor).toBe('ECOX0104681L');
    expect(a.published).toBe('2001-08-02');
    expect(a.journal).toBeNull();
    expect(a.version).toBe('consolidated');
    expect(a.on).toMatch(DATE);
    expect(a.items.length).toBeGreaterThan(0);
    expect(a.items[0].section_id).toEqual(expect.any(String));
    expect(a.link).toBe('https://www.legifrance.gouv.fr/loda/id/LEGITEXT000005631294');
  });

  it('loi 78-17 by id on 1970-01-01: no version then, not "not found"', async () => {
    const a = expectAnswer(await call({ id: LOI_78_17_ID, at_date: '1970-01-01' }), NOT_IN_FORCE);
    expect(a.warnings[0]).toBe('No text LEGITEXT000006068624 in force on 1970-01-01.');
    expect(a.asked).toBe('text LEGITEXT000006068624');
    expect(a.on).toBe('1970-01-01');
    expect(a.candidates).toHaveLength(1);
    expect(a.candidates[0]).toMatchObject({
      title: LOI_78_17,
      nature: 'LOI',
      id: LOI_78_17_ID,
      link: LOI_78_17_LINK,
      verdict: 'no_version',
      verdict_date: null,
    });
  });

  it('décret 2005-1309 by id on 2015-01-01: the version then in force', async () => {
    const a = expectAnswer(
      await call({ id: 'LEGITEXT000006052581', at_date: '2015-01-01' }),
      FOUND,
    );
    expect(a.version).toBe('consolidated');
    expect(a.on).toBe('2015-01-01');
    expect(a.legifrance_status).toBe('Vigueur');
    expect(a.link).toBe('https://www.legifrance.gouv.fr/loda/id/LEGITEXT000006052581');
  });

  it('décret 2005-1309 on 2015-01-01: art. 82 has no in-force dates — text shown, no status, not counted', async () => {
    // Fixture 118: 131 articles, 127 covering 2015-01-01 by their dates (the rule of the text's
    // verdict); art. 82 is labelled VIGUEUR with a 2999 → 2999 window, i.e. no dates at all.
    const outline = expectAnswer(
      await call({ id: 'LEGITEXT000006052581', at_date: '2015-01-01' }),
      FOUND,
    );
    expect(outline.article_count).toBe(131);
    expect(outline.in_force_count).toBe(127);
    expect(outline.on).toBe('2015-01-01');

    const client = await composed();
    const pages = await readTextPages(client, {
      id: 'LEGITEXT000006052581',
      at_date: '2015-01-01',
      part: 'articles',
    });
    for (const page of pages) {
      expect(page.article_count).toBe(131);
      expect(page.in_force_count).toBe(127);
    }
    const art82 = pages
      .flatMap((p) => p.items)
      .find((i: Answer) => i.id === 'LEGIARTI000006551791');
    expect(art82).toMatchObject({ number: '82', status: null, legifrance_status: 'VIGUEUR' });
    expect(art82?.text.startsWith('a modifié les dispositions suivantes')).toBe(true);
  });

  it('page 99 of loi 78-17 articles: no results, the same fields, no items', async () => {
    const client = await composed();
    const args = { nature: 'loi', number: '78-17', part: 'articles' };
    const first = expectAnswer(await client.callTool({ name: TOOL, arguments: args }), FOUND);
    const past = expectAnswer(
      await client.callTool({ name: TOOL, arguments: { ...args, page: 99 } }),
      NO_RESULTS,
    );
    expect(Object.keys(past)).toEqual(Object.keys(first));
    expect(past.items).toEqual([]);
    expect(past.page).toEqual({ number: 99, of: first.page.of });
    expect(past.page.number).toBeGreaterThan(past.page.of);
    expect(past.next).toBeNull();
    expect(past.results).toBe(187);
    expect(past.title).toBe(LOI_78_17);
    expect(past.request.page).toBe(99);
  });

  it('is listed with its description, annotations and an output schema', async () => {
    const client = await composed();
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === TOOL);
    expect(tool?.description).toBe(
      'Read a French law, ordinance, decree or order from Légifrance — by Légifrance id (LEGITEXT… consolidated version, JORFTEXT… as published), by NOR, or by nature + number (e.g. nature "loi", number "78-17"). "outline" returns the text\'s title, status, publication and its sections with article counts; "articles" returns the article texts page by page (optionally only one section via section_id). at_date picks the consolidated version in force on that date. Collective agreements (KALI) are not supported here: find them with legifrance_search_legislation.',
    );
    expect(tool?.annotations).toEqual({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    });
    expect(tool?.outputSchema?.type).toBe('object');
    const properties = tool?.inputSchema.properties as Record<string, { enum?: string[] }>;
    expect(properties.nature?.enum).toEqual([
      'loi',
      'loi_organique',
      'ordonnance',
      'decret',
      'arrete',
    ]);
  });
});
