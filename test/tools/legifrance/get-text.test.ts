import { afterEach, describe, expect, it } from 'vitest';
import { compose } from '../../../src/compose.js';
import type {
  GetTextInput,
  GetTextResult,
  NotInForceText,
  TextView,
} from '../../../src/services/legislation/get-text.js';
import type {
  CallContext,
  LegislationHit,
  TextArticle,
  TextRecord,
  TextSection,
} from '../../../src/services/legislation/ports.js';
import { VigueurError } from '../../../src/shared/errors.js';
import { toolAnswer } from '../../../src/tools/envelope.js';
import { MAX_TOOL_TEXT } from '../../../src/tools/format.js';
import {
  buildGetTextAnswer,
  type GetTextAnswerOptions,
  getTextOutput,
} from '../../../src/tools/legifrance/get-text.js';
import {
  createLegifranceSource,
  type LegifranceServices,
} from '../../../src/tools/legifrance/index.js';
import { expectAnswer, expectToolError } from '../../helpers/answer.js';
import { fixtureFetch, sandboxConfig } from '../../helpers/fixture-fetch.js';
import { connectClient } from '../../helpers/mcp-client.js';

const TOOL = 'legifrance_get_text';
const SOURCE = 'Légifrance';
const FOUND = { source: SOURCE, outcome: 'found' };
const NO_RESULTS = { source: SOURCE, outcome: 'no_results' };
const NOT_IN_FORCE = { source: SOURCE, outcome: 'not_in_force' };
const NOT_FOUND = { source: SOURCE, outcome: 'not_found' };
const DATE = /^\d{4}-\d\d-\d\d$/;

type Answer = ReturnType<typeof expectAnswer>;

let cleanup: Array<() => Promise<void>> = [];
let unmatchedRoutes: string[][] = [];

afterEach(async () => {
  for (const close of cleanup.reverse()) await close();
  cleanup = [];
  // Reset before asserting, so one test's unmatched request never fails the next ones.
  const pending = unmatchedRoutes;
  unmatchedRoutes = [];
  for (const unmatched of pending) expect(unmatched, 'requests without a fixture').toEqual([]);
});

type Client = Awaited<ReturnType<typeof connectClient>>['client'];

async function connect(deps: Parameters<typeof connectClient>[0]): Promise<Client> {
  const { client, close } = await connectClient(deps);
  cleanup.push(close);
  return client;
}

/** A client over the composed server, answering PISTE from the Légifrance fixtures. */
async function composedClient(): Promise<Client> {
  const fixtures = fixtureFetch();
  unmatchedRoutes.push(fixtures.unmatched);
  return connect(compose(sandboxConfig(), { fetch: fixtures.fetch }));
}

async function call(args: Record<string, unknown>) {
  const client = await composedClient();
  return client.callTool({ name: TOOL, arguments: args });
}

/** Every page of an answer, following its `next.page` from the first page. */
async function readAllPages(client: Client, args: Record<string, unknown>): Promise<Answer[]> {
  const pages: Answer[] = [];
  let page = 1;
  for (let i = 0; i < 50; i++) {
    const result = await client.callTool({
      name: TOOL,
      arguments: page > 1 ? { ...args, page } : args,
    });
    const a = expectAnswer(result, FOUND);
    pages.push(a);
    if (a.next === null) return pages;
    page = a.next.page;
    expect(page).toBe(pages.length + 1);
  }
  throw new Error('more than 50 pages');
}

const LOI_78_17 =
  "Loi n° 78-17 du 6 janvier 1978 relative à l'informatique, aux fichiers et aux libertés";
const LOI_78_17_ID = 'LEGITEXT000006068624';
const LOI_78_17_LINK = 'https://www.legifrance.gouv.fr/loda/id/LEGITEXT000006068624';
const ORD_2016_131 =
  'Ordonnance n° 2016-131 du 10 février 2016 portant réforme du droit des contrats, du régime général et de la preuve des obligations';
const ORD_2016_131_ID = 'JORFTEXT000032004939';
const ORD_2016_131_LINK = 'https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000032004939';

const withheld = (on: string) =>
  `(Text not shown: not in force on ${on}. Read it with an "at_date" inside its validity, or with legifrance_get_article and its id.)`;

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
    const client = await composedClient();
    const pages = await readAllPages(client, { nature: 'loi', number: '78-17', part: 'articles' });
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
    const client = await composedClient();
    const pages = await readAllPages(client, { nature: 'loi', number: '78-17', part: 'articles' });
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

    const client = await composedClient();
    const pages = await readAllPages(client, {
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
    const client = await composedClient();
    const pages = await readAllPages(client, { nor: 'JUSC1522466R', part: 'articles' });
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

    const client = await composedClient();
    const pages = await readAllPages(client, {
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
    const client = await composedClient();
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
    const client = await composedClient();
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

// ---------------------------------------------------------------------------------------------
// The tool over a fake service: inputs, signal, request echo, deadline.

const TODAY = '2026-11-12';
const NOW = new Date('2026-11-12T09:30:15.250Z');

function fakeServices(getText: LegifranceServices['getText']): LegifranceServices {
  const unused = () => Promise.reject(new Error('not used in these tests'));
  return {
    getArticle: unused,
    getArticleHistory: unused,
    searchLegislation: unused,
    listChanges: unused,
    getText,
    browseCode: unused,
    latestJo: unused,
    listReferenceValues: unused,
    searchCaseLaw: unused,
    getDecision: unused,
  };
}

async function clientOver(getText: LegifranceServices['getText'], deadlineMs?: number) {
  return connect({
    config: sandboxConfig(),
    getStatus: () => Promise.reject(new Error('not used')),
    sources: [
      createLegifranceSource(fakeServices(getText), {
        today: () => TODAY,
        now: () => NOW,
        ...(deadlineMs !== undefined && { deadlineMs }),
      }),
    ],
  });
}

const article = (n: number, over: Partial<TextArticle> = {}): TextArticle => ({
  id: `LEGIARTI${String(n).padStart(12, '0')}`,
  num: String(n),
  status: 'in_force',
  rawStatus: 'VIGUEUR',
  validFrom: '2010-01-01',
  validTo: null,
  validToUndetermined: false,
  text: `Texte de l'article ${n}.`,
  ...over,
});

const section = (cid: string, title: string, over: Partial<TextSection> = {}): TextSection => ({
  id: cid,
  cid,
  title,
  status: 'in_force',
  validFrom: null,
  validTo: null,
  sections: [],
  articles: [],
  ...over,
});

function record(over: Partial<TextRecord> = {}): TextRecord {
  return {
    id: 'LEGITEXT000000000001',
    cid: 'JORFTEXT000000000001',
    title: 'Loi n° 2010-1 du 1er janvier 2010 de test',
    nature: 'LOI',
    status: null,
    jurisState: 'Vigueur',
    nor: null,
    jorfLabel: null,
    publishedOn: '2010-01-02',
    signedOn: null,
    validFrom: null,
    validTo: null,
    visa: null,
    nota: null,
    sections: [],
    articles: [],
    ...over,
  };
}

/** A found text as the service builds it (no focus). */
function foundText(r: TextRecord, warnings: string[] = []): GetTextResult {
  const flatArticles: TextView['flatArticles'] = r.articles.map((a) => ({ article: a, path: [] }));
  const walk = (ss: TextSection[], parents: string[]) => {
    for (const s of ss) {
      const path = [...parents, s.title];
      for (const a of s.articles) flatArticles.push({ article: a, path });
      walk(s.sections, path);
    }
  };
  walk(r.sections, []);
  return {
    kind: 'found',
    text: {
      record: r,
      asOf: TODAY,
      url: `https://www.legifrance.gouv.fr/loda/id/${r.id}`,
      focus: null,
      flatArticles,
      warnings,
    },
  };
}

describe('legifrance_get_text handler', () => {
  it('passes the inputs (blank → absent) and the abort signal to the service', async () => {
    const seen: Array<{ input: GetTextInput; ctx: CallContext | undefined }> = [];
    const client = await clientOver(async (input, ctx) => {
      seen.push({ input, ctx });
      return foundText(record());
    });
    const blank = await client.callTool({
      name: TOOL,
      arguments: {
        id: '',
        nor: ' ',
        nature: 'loi',
        number: ' 2010-1 ',
        at_date: '',
        section_id: '',
      },
    });
    await client.callTool({
      name: TOOL,
      arguments: { id: ' LEGITEXT000000000001 ', at_date: '2020-01-01', section_id: 'LEGISCTA1' },
    });
    expect(seen).toHaveLength(2);
    expect(seen[0]?.input).toEqual({ nature: 'loi', number: '2010-1' });
    expect(seen[1]?.input).toEqual({
      id: 'LEGITEXT000000000001',
      atDate: '2020-01-01',
      sectionCid: 'LEGISCTA1',
    });
    expect(seen[0]?.ctx?.signal).toBeInstanceOf(AbortSignal);
    // Blank inputs are left out of the request; defaults are filled in.
    expect(expectAnswer(blank, FOUND).request).toEqual({
      tool: TOOL,
      nature: 'loi',
      number: '2010-1',
      at_date: TODAY,
      part: 'outline',
      page: 1,
    });
  });

  it('found: the request with its defaults, and the time from the injected clock', async () => {
    const client = await clientOver(async () => foundText(record()));
    const a = expectAnswer(
      await client.callTool({ name: TOOL, arguments: { id: 'LEGITEXT000000000001' } }),
      FOUND,
    );
    expect(a.request).toEqual({
      tool: TOOL,
      id: 'LEGITEXT000000000001',
      at_date: TODAY,
      part: 'outline',
      page: 1,
    });
    expect(a.retrieved).toBe('2026-11-12T09:30:15Z');
    expect(a.cached).toEqual([]);
  });

  it('a text read as published (JORFTEXT id or NOR) gets no at_date default', async () => {
    const client = await clientOver(async () => foundText(record()));
    const byId = expectAnswer(
      await client.callTool({ name: TOOL, arguments: { id: 'JORFTEXT000000000001' } }),
      FOUND,
    );
    expect(byId.request).toEqual({
      tool: TOOL,
      id: 'JORFTEXT000000000001',
      part: 'outline',
      page: 1,
    });
    const byNor = expectAnswer(
      await client.callTool({ name: TOOL, arguments: { nor: 'ABCD0000001D', part: 'articles' } }),
      FOUND,
    );
    expect(byNor.request).toEqual({ tool: TOOL, nor: 'ABCD0000001D', part: 'articles', page: 1 });
  });

  it('rejects a nature outside the enum', async () => {
    const client = await clientOver(async () => foundText(record()));
    const result = await client.callTool({
      name: TOOL,
      arguments: { nature: 'circulaire', number: '1' },
    });
    expect(result.isError).toBe(true);
  });

  it('a page past the end is no_results, with the same fields as the last page', async () => {
    const client = await clientOver(async () =>
      foundText(record({ articles: [article(1), article(2)] })),
    );
    const args = { id: 'LEGITEXT000000000001', part: 'articles' };
    const last = expectAnswer(await client.callTool({ name: TOOL, arguments: args }), FOUND);
    const past = expectAnswer(
      await client.callTool({ name: TOOL, arguments: { ...args, page: 2 } }),
      NO_RESULTS,
    );
    expect(Object.keys(past)).toEqual(Object.keys(last));
    expect(past.items).toEqual([]);
    expect(past.page).toEqual({ number: 2, of: 1 });
    expect(past.next).toBeNull();
    expect(past.results).toBe(2);
    expect(past.article_count).toBe(2);
    expect(past.warnings).toEqual([]);
    expect(past.request.page).toBe(2);
  });

  it('service errors are JSON tool errors with the request; the deadline has its own message', async () => {
    const failing = await clientOver(() =>
      Promise.reject(new VigueurError('invalid_input', 'Give exactly one target.')),
    );
    const failed = expectToolError(
      await failing.callTool({ name: TOOL, arguments: { number: '1' } }),
      'invalid_input',
    );
    expect(failed.error.message).toContain('Give exactly one target.');
    expect(failed.request).toEqual({
      tool: TOOL,
      number: '1',
      at_date: TODAY,
      part: 'outline',
      page: 1,
    });
    expect(failed).not.toHaveProperty('retrieved');

    const slow = await clientOver(
      (_input, ctx) =>
        new Promise((_resolve, reject) => {
          ctx?.signal?.addEventListener('abort', () =>
            reject(new VigueurError('cancelled', 'cancelled')),
          );
        }),
      20,
    );
    const late = expectToolError(
      await slow.callTool({ name: TOOL, arguments: { id: 'LEGITEXT000000000001' } }),
      'deadline',
    );
    expect(late.error.message).toContain('did not answer within');
    expect(late.request.id).toBe('LEGITEXT000000000001');
    expect(late).not.toHaveProperty('retrieved');
  });
});

// ---------------------------------------------------------------------------------------------
// The answer builder, through the schema and the envelope.

const LOI_2010_1: GetTextInput = { nature: 'loi', number: '2010-1' };
const DECRET_2000_1: GetTextInput = { nature: 'decret', number: '2000-1' };
const REQUEST = {
  tool: TOOL,
  nature: 'loi',
  number: '2010-1',
  at_date: TODAY,
  part: 'outline',
  page: 1,
};

function answer(
  r: GetTextResult,
  outcome: string,
  opts: Partial<GetTextAnswerOptions> = {},
): Answer {
  return expectAnswer(
    toolAnswer(
      getTextOutput,
      buildGetTextAnswer(r, {
        request: REQUEST,
        part: 'outline',
        page: 1,
        input: LOI_2010_1,
        today: TODAY,
        ...opts,
      }),
      { now: () => NOW },
    ),
    { source: SOURCE, outcome },
  );
}

const outlineOf = (r: GetTextResult, page = 1) => answer(r, 'found', { page });
const articlesOf = (r: GetTextResult, page = 1) => answer(r, 'found', { part: 'articles', page });

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
