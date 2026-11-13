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
import { MAX_TOOL_TEXT } from '../../../src/tools/format.js';
import { renderGetText } from '../../../src/tools/legifrance/get-text.js';
import {
  createLegifranceSource,
  type LegifranceServices,
} from '../../../src/tools/legifrance/index.js';
import { fixtureFetch, sandboxConfig } from '../../helpers/fixture-fetch.js';
import { connectClient, firstText } from '../../helpers/mcp-client.js';

const TOOL = 'legifrance_get_text';

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
  const result = await client.callTool({ name: TOOL, arguments: args });
  return { result, text: firstText(result) };
}

/** Every page of an answer, following its `Next page: "page": n` hints. */
async function readAllPages(client: Client, args: Record<string, unknown>): Promise<string[]> {
  const pages: string[] = [];
  let page = 1;
  for (let i = 0; i < 50; i++) {
    const result = await client.callTool({
      name: TOOL,
      arguments: page > 1 ? { ...args, page } : args,
    });
    const text = firstText(result);
    expect(result.isError, text).toBeFalsy();
    pages.push(text);
    const next = /Next page: "page": (\d+)/.exec(text);
    if (next?.[1] === undefined) return pages;
    page = Number(next[1]);
    expect(page).toBe(pages.length + 1);
  }
  throw new Error('more than 50 pages');
}

const LOI_78_17 =
  "### Loi n° 78-17 du 6 janvier 1978 relative à l'informatique, aux fichiers et aux libertés";
const LOI_78_17_SOURCE = 'Source: https://www.legifrance.gouv.fr/loda/id/LEGITEXT000006068624';
const ORD_2016_131 =
  '### Ordonnance n° 2016-131 du 10 février 2016 portant réforme du droit des contrats, du régime général et de la preuve des obligations';
const ORD_2016_131_SOURCE = 'Source: https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000032004939';

describe('legifrance_get_text over the composed server (fixtures)', () => {
  it('loi 78-17 by nature + number: outline with its sections, publication and link', async () => {
    const { result, text } = await call({ nature: 'loi', number: '78-17' });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toBeUndefined();
    expect(text).toContain(LOI_78_17);
    expect(text).toContain('Loi n° 78-17');
    expect(text).toContain('LOI · Légifrance status: Vigueur');
    expect(text).toContain('Published: 1978-01-07 (Journal officiel publication date)');
    expect(text).toMatch(/^Version in force on \d{4}-\d{2}-\d{2} \(consolidated\)$/m);
    expect(text).toMatch(
      /^- Titre Ier : Dispositions communes · 52 articles \(\d+ in force\) · section_id LEGISCTA000037802702$/m,
    );
    expect(text).toMatch(
      /^ {2}- Chapitre Ier : Principes et définitions · 8 articles \(\d+ in force\) · section_id LEGISCTA000006095881$/m,
    );
    expect(text).toContain('section_id');
    expect(text).not.toContain('#### Art.');
    expect(text).toContain('"part": "articles"');
    expect(text).toContain(LOI_78_17_SOURCE);
    expect(text.length).toBeLessThanOrEqual(MAX_TOOL_TEXT);
  });

  it('loi "n° 78-17": the "n°" typed with the number is not part of it', async () => {
    const { result, text } = await call({ nature: 'loi', number: 'n° 78-17' });
    expect(result.isError).toBeFalsy();
    expect(text).toContain(LOI_78_17);
    expect(text).toContain(LOI_78_17_SOURCE);
  });

  it('loi 78-17 articles: bounded pages, each with the header and the link, every article once', async () => {
    const client = await composedClient();
    const pages = await readAllPages(client, { nature: 'loi', number: '78-17', part: 'articles' });
    expect(pages.length).toBeGreaterThan(1);
    const [first, second] = pages;
    expect(first).toContain('#### Art. 1\n');
    expect(first).toContain("L'informatique doit être au service de chaque citoyen.");
    expect(first).toContain('Next page: "page": 2');
    expect(second).toContain(LOI_78_17);
    expect(second).toContain(LOI_78_17_SOURCE);
    for (const [i, page] of pages.entries()) {
      expect(page.length).toBeLessThanOrEqual(MAX_TOOL_TEXT);
      expect(page.startsWith(LOI_78_17)).toBe(true);
      expect(page).toMatch(/^Version in force on \d{4}-\d{2}-\d{2} \(consolidated\)$/m);
      expect(page).toContain(`page ${i + 1} of ${pages.length}`);
      expect(page.trimEnd().endsWith('Légifrance id: LEGITEXT000006068624')).toBe(true);
      expect(page).toContain(LOI_78_17_SOURCE);
    }
    expect(pages.at(-1)).not.toContain('Next page');
    expect(pages.flatMap((p) => p.match(/^#### Art\. .+$/gm) ?? [])).toHaveLength(187);
    // Numbers repeat (old repealed chapters reused 32, 43…): each article is told by its id.
    const ids = pages.flatMap((p) => p.match(/ · id LEGIARTI\d{12}$/gm) ?? []);
    expect(ids).toHaveLength(187);
    expect(new Set(ids).size).toBe(187);
  });

  it('an article not in force on the date: labelled, its text not shown as current law', async () => {
    const client = await composedClient();
    const pages = await readAllPages(client, { nature: 'loi', number: '78-17', part: 'articles' });
    const block = /#### Art\. 5-1\n(.+)\n(.+)/.exec(pages.join('\n'));
    expect(block?.[1]).toMatch(
      /^⛔ Not in force on \d{4}-\d{2}-\d{2}: in force 2018-05-25 → 2019-06-01 \(ABROGE\) · id LEGIARTI000037088068$/,
    );
    expect(block?.[2]).toMatch(/^\(Text not shown: not in force on \d{4}-\d{2}-\d{2}\./);
    expect(pages.join('\n')).toMatch(
      /#### Art\. 1\n✅ In force on \d{4}-\d{2}-\d{2} \(since 2019-06-01, no end date\) \(VIGUEUR\) · id LEGIARTI000037822962\n/,
    );
  });

  it('one section: its outline, then only its articles, with the section path', async () => {
    const path =
      'Section: Titre Ier : Dispositions communes › Chapitre Ier : Principes et définitions';
    const outline = await call({
      nature: 'loi',
      number: '78-17',
      section_id: 'LEGISCTA000006095881',
    });
    expect(outline.result.isError).toBeFalsy();
    expect(outline.text).toContain(`${path} · section_id LEGISCTA000006095881`);
    expect(outline.text).not.toContain('Titre II');

    const client = await composedClient();
    const pages = await readAllPages(client, {
      nature: 'loi',
      number: '78-17',
      section_id: 'LEGISCTA000006095881',
      part: 'articles',
    });
    expect(pages).toHaveLength(1);
    expect(pages[0]?.match(/^#### Art\. .+$/gm)).toHaveLength(8);
    expect(pages[0]).toContain(path);
  });

  it('an unknown section_id is an error naming the section_id parameter', async () => {
    const { result, text } = await call({
      nature: 'loi',
      number: '78-17',
      section_id: 'LEGISCTA000000000000',
    });
    expect(result.isError).toBe(true);
    expect(text).toContain('"LEGISCTA000000000000"');
    expect(text).toContain('Omit "section_id" to read the whole text.');
  });

  it('by NOR: the ordonnance as published in the Journal officiel, with its publication', async () => {
    const { result, text } = await call({ nor: 'JUSC1522466R' });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toBeUndefined();
    expect(text).toContain(ORD_2016_131);
    expect(text).toContain(
      'ORDONNANCE · Légifrance status: Sans état juridique · NOR JUSC1522466R',
    );
    expect(text).toContain('Published: 2016-02-11 (JORF n°0035 du 11 février 2016)');
    expect(text).toContain(
      'As published in the Journal officiel: initial version, later amendments not included',
    );
    expect(text).not.toContain('Version in force on');
    expect(text).toMatch(
      /^- Titre IER : DISPOSITIONS RELATIVES AU LIVRE III DU CODE CIVIL · 4 articles · section_id JORFSCTA000032004942$/m,
    );
    expect(text).toContain(ORD_2016_131_SOURCE);
  });

  it('by NOR, articles: a 62 000-character article is split over bounded pages', async () => {
    const client = await composedClient();
    const pages = await readAllPages(client, { nor: 'JUSC1522466R', part: 'articles' });
    const all = pages.join('\n');
    for (const page of pages) {
      expect(page.length).toBeLessThanOrEqual(MAX_TOOL_TEXT);
      expect(page.startsWith(ORD_2016_131)).toBe(true);
      expect(page).toContain('Published: 2016-02-11');
      expect(page).toContain(ORD_2016_131_SOURCE);
    }
    expect(all).toMatch(
      /^#### Art\. 2 \(part 1 of [2-9]\)\nAs published · id JORFARTI000032005157$/m,
    );
    expect(all).toContain("Le titre III est ainsi rédigé :\n« Titre III\n« DES SOURCES D'");
    expect(all).toContain('demnité due est égale à la plus forte de ces deux valeurs. »');
    expect(all).not.toContain('In force on');
  });

  it('by JORFTEXT id: read as published', async () => {
    const { result, text } = await call({ id: 'JORFTEXT000032004939' });
    expect(result.isError).toBeFalsy();
    expect(text).toContain(ORD_2016_131);
    expect(text).toContain('Published: 2016-02-11 (JORF n°0035 du 11 février 2016)');
    expect(text).toContain(ORD_2016_131_SOURCE);
  });

  it('a collective agreement id is refused, pointing to legifrance_search_legislation', async () => {
    const { result, text } = await call({ id: 'KALITEXT000005635221' });
    expect(result.isError).toBe(true);
    expect(text).toContain('legifrance_search_legislation');
  });

  it('an unknown text id (Légifrance HTTP 400) is a miss echoing the id, not an error', async () => {
    const { result, text } = await call({ id: 'LEGITEXT999999999999' });
    expect(result.isError).toBeFalsy();
    expect(text).toContain('No text LEGITEXT999999999999 on Légifrance.');
  });

  it('décret 2005-1309 today: not in force, listed with when it ceased, never shown as law', async () => {
    const { result, text } = await call({ nature: 'decret', number: '2005-1309' });
    expect(result.isError).toBeFalsy();
    expect(text).toMatch(/^No décret 2005-1309 in force on \d{4}-\d{2}-\d{2}\.$/m);
    expect(text).toContain('Décret n°2005-1309 du 20 octobre 2005');
    expect(text).toContain('DECRET · NOR JUSC0520586D · Published 2005-10-22');
    expect(text).toContain('no longer in force — ceased 2019-06-01');
    expect(text).toMatch(
      /· id (LEGITEXT00000605258[01]) · https:\/\/www\.legifrance\.gouv\.fr\/loda\/id\/\1$/m,
    );
    expect(text).toContain('To read it, pass its id with an at_date inside its validity.');
    expect(text).not.toContain('#### Art.');
    expect(text).not.toContain('Les membres de la Commission nationale');
    expect(text).not.toContain('Version in force on');
    expect(text).not.toMatch(/2999|2222/);
  });

  it('loi organique 2001-692 (LOLF): found although LODA files it as LOI', async () => {
    const { result, text } = await call({ nature: 'loi_organique', number: '2001-692' });
    expect(result.isError).toBeFalsy();
    expect(text).toContain(
      '### Loi organique n° 2001-692 du 1 août 2001 relative aux lois de finances',
    );
    expect(text).toContain('LOI · Légifrance status: Vigueur · NOR ECOX0104681L');
    expect(text).toContain('Published: 2001-08-02 (Journal officiel publication date)');
    expect(text).toMatch(/^Version in force on \d{4}-\d{2}-\d{2} \(consolidated\)$/m);
    expect(text).toContain('section_id');
    expect(text).toContain('Source: https://www.legifrance.gouv.fr/loda/id/LEGITEXT000005631294');
    expect(text).not.toMatch(/No loi organique|Several texts|carry that number/);
  });

  it('loi 78-17 by id on 1970-01-01: no version then, not "not found"', async () => {
    const { result, text } = await call({ id: 'LEGITEXT000006068624', at_date: '1970-01-01' });
    expect(result.isError).toBeFalsy();
    expect(text).toContain('No text LEGITEXT000006068624 in force on 1970-01-01.');
    expect(text).toContain(
      "- Loi n° 78-17 du 6 janvier 1978 relative à l'informatique, aux fichiers et aux libertés · LOI",
    );
    expect(text).toContain(
      'Légifrance has no version of this text on 1970-01-01 — try a later at_date · id LEGITEXT000006068624 · https://www.legifrance.gouv.fr/loda/id/LEGITEXT000006068624',
    );
    expect(text).not.toContain('on Légifrance. Check it');
    expect(text).not.toContain('#### Art.');
  });

  it('décret 2005-1309 by id on 2015-01-01: the version then in force', async () => {
    const { result, text } = await call({ id: 'LEGITEXT000006052581', at_date: '2015-01-01' });
    expect(result.isError).toBeFalsy();
    expect(text).toContain('Version in force on 2015-01-01 (consolidated)');
    expect(text).toContain('Légifrance status: Vigueur');
    expect(text).toContain('Source: https://www.legifrance.gouv.fr/loda/id/LEGITEXT000006052581');
  });

  it('décret 2005-1309 on 2015-01-01: art. 82 has no in-force dates — text shown, never ✅, not counted', async () => {
    // Fixture 118: 131 articles, 127 covering 2015-01-01 by their dates (the rule of the text's
    // verdict); art. 82 is labelled VIGUEUR with a 2999 → 2999 window, i.e. no dates at all.
    const outline = await call({ id: 'LEGITEXT000006052581', at_date: '2015-01-01' });
    expect(outline.text).toContain('131 articles (127 in force on 2015-01-01)');

    const client = await composedClient();
    const pages = await readAllPages(client, {
      id: 'LEGITEXT000006052581',
      at_date: '2015-01-01',
      part: 'articles',
    });
    for (const page of pages) expect(page).toContain('131 articles (127 in force on 2015-01-01)');
    const all = pages.join('\n\n');
    expect(all).toContain(
      '#### Art. 82\nLégifrance gives no in-force dates for this article (VIGUEUR) · id LEGIARTI000006551791\na modifié les dispositions suivantes',
    );
    expect(all).not.toMatch(/✅[^\n]*· id LEGIARTI000006551791/);
  });

  it('is listed with its description, annotations and no output schema', async () => {
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
    expect(tool?.outputSchema).toBeUndefined();
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
// The tool over a fake service: inputs, signal, deadline.

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
        today: () => '2026-11-12',
        ...(deadlineMs !== undefined && { deadlineMs }),
      }),
    ],
  });
}

const TODAY = '2026-11-12';

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
    await client.callTool({
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
  });

  it('rejects a nature outside the enum', async () => {
    const client = await clientOver(async () => foundText(record()));
    const result = await client.callTool({
      name: TOOL,
      arguments: { nature: 'circulaire', number: '1' },
    });
    expect(result.isError).toBe(true);
  });

  it('a page past the end is an error', async () => {
    const client = await clientOver(async () =>
      foundText(record({ articles: [article(1), article(2)] })),
    );
    const result = await client.callTool({
      name: TOOL,
      arguments: { id: 'LEGITEXT000000000001', part: 'articles', page: 2 },
    });
    expect(result.isError).toBe(true);
    expect(firstText(result)).toContain('past the last page');
  });

  it('service errors are tool errors; the deadline has its own message', async () => {
    const failing = await clientOver(() =>
      Promise.reject(new VigueurError('invalid_input', 'Give exactly one target.')),
    );
    const failed = await failing.callTool({ name: TOOL, arguments: { number: '1' } });
    expect(failed.isError).toBe(true);
    expect(firstText(failed)).toContain('Give exactly one target.');

    const slow = await clientOver(
      (_input, ctx) =>
        new Promise((_resolve, reject) => {
          ctx?.signal?.addEventListener('abort', () =>
            reject(new VigueurError('cancelled', 'cancelled')),
          );
        }),
      20,
    );
    const late = await slow.callTool({ name: TOOL, arguments: { id: 'LEGITEXT000000000001' } });
    expect(late.isError).toBe(true);
    expect(firstText(late)).toContain('did not answer within');
  });
});

// ---------------------------------------------------------------------------------------------

const LOI_2010_1: GetTextInput = { nature: 'loi', number: '2010-1' };
const DECRET_2000_1: GetTextInput = { nature: 'decret', number: '2000-1' };
const outline = (r: GetTextResult, input: GetTextInput = LOI_2010_1) =>
  renderGetText(r, { part: 'outline', page: 1, input });
const articles = (r: GetTextResult, page = 1) =>
  renderGetText(r, { part: 'articles', page, input: LOI_2010_1 });

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

describe('renderGetText: texts that are not found, ambiguous or not in force', () => {
  it('ambiguous: one line per text with its id and link, how to pick, and no status labels', () => {
    const text = outline(
      { kind: 'ambiguous', candidates: [hit(1), hit(2)], more: false },
      DECRET_2000_1,
    );
    expect(text).toBe(
      [
        'Several texts match décret 2000-1:',
        '- Décret n° 2000-1 du 1er janvier 2000 (1) · DECRET · NOR ABCD0000001D · Published 2000-01-02 · id LEGITEXT000000000001 · https://www.legifrance.gouv.fr/loda/id/LEGITEXT000000000001',
        '- Décret n° 2000-1 du 1er janvier 2000 (2) · DECRET · NOR ABCD0000002D · Published 2000-01-02 · id LEGITEXT000000000002 · https://www.legifrance.gouv.fr/loda/id/LEGITEXT000000000002',
        'Call again with the "id" of the text you mean.',
      ].join('\n'),
    );
  });

  it('ambiguous with more matches says so', () => {
    const text = outline({ kind: 'ambiguous', candidates: [hit(1), hit(2)], more: true });
    expect(text).toContain(
      'Légifrance lists more matches than shown; refine with nature or a Légifrance id.',
    );
  });

  it('not in force: each verdict in words, ids and links, the hint, no sentinel date', () => {
    const text = outline(
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
      DECRET_2000_1,
    );
    expect(text).toBe(
      [
        'No décret 2000-1 in force on 2026-11-12.',
        '- Décret n° 2000-1 du 1er janvier 2000 · DECRET · NOR ABCD0000001D · Published 2000-01-02 · no longer in force — ceased 2019-06-01 · id LEGITEXT000000000001 · https://www.legifrance.gouv.fr/loda/id/LEGITEXT000000000001',
        '- Décret n° 2000-1 du 1er janvier 2000 · DECRET · NOR ABCD0000001D · Published 2000-01-02 · no longer in force · id LEGITEXT000000000002 · https://www.legifrance.gouv.fr/loda/id/LEGITEXT000000000002',
        '- Décret n° 2000-1 du 1er janvier 2000 · DECRET · NOR ABCD0000001D · Published 2000-01-02 · not yet in force — enters into force 2027-01-01 · id LEGITEXT000000000003 · https://www.legifrance.gouv.fr/loda/id/LEGITEXT000000000003',
        '- Décret n° 2000-1 du 1er janvier 2000 · DECRET · Published 2000-01-02 · in-force dates not determinable from Légifrance · id JORFTEXT000000000004 · https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000000000004',
        'To read it, pass its id with an at_date inside its validity.',
      ].join('\n'),
    );
  });

  it('no version on the date: says so and points to a later at_date, no date invented', () => {
    const text = outline(
      {
        kind: 'not_in_force',
        input: 'LEGITEXT000000000001',
        asOf: '1970-01-01',
        candidates: [candidate({ verdict: 'no_version', on: null })],
        more: false,
      },
      { id: 'LEGITEXT000000000001', atDate: '1970-01-01' },
    );
    expect(text).toBe(
      [
        'No text LEGITEXT000000000001 in force on 1970-01-01.',
        '- Décret n° 2000-1 du 1er janvier 2000 · DECRET · NOR ABCD0000001D · Published 2000-01-02 · Légifrance has no version of this text on 1970-01-01 — try a later at_date · id LEGITEXT000000000001 · https://www.legifrance.gouv.fr/loda/id/LEGITEXT000000000001',
        'To read it, pass its id with an at_date inside its validity.',
      ].join('\n'),
    );
  });

  it('every candidate undetermined: Légifrance gives no in-force dates, not "no text in force"', () => {
    const undetermined = candidate({ verdict: 'undetermined', on: null });
    const text = outline(
      {
        kind: 'not_in_force',
        input: 'decret 2000-1',
        asOf: TODAY,
        candidates: [undetermined, { ...undetermined, textId: 'LEGITEXT000000000002' }],
        more: false,
      },
      DECRET_2000_1,
    );
    expect(text.split('\n')[0]).toBe(
      'Légifrance gives no in-force dates for décret 2000-1 on 2026-11-12.',
    );
    expect(text).not.toContain('No décret 2000-1 in force');
    expect(text).toContain('in-force dates not determinable from Légifrance');
    const mixed = outline(
      {
        kind: 'not_in_force',
        input: 'decret 2000-1',
        asOf: TODAY,
        candidates: [undetermined, candidate({ textId: 'LEGITEXT000000000002' })],
        more: false,
      },
      DECRET_2000_1,
    );
    expect(mixed.split('\n')[0]).toBe('No décret 2000-1 in force on 2026-11-12.');
  });

  it('another nature: the texts carrying the number, with ids and links, and how to read one', () => {
    const text = outline(
      {
        kind: 'other_nature',
        input: 'loi 2000-1',
        number: '2000-1',
        candidates: [hit(1), hit(2, { nor: null, publishedOn: null })],
        more: false,
      },
      { nature: 'loi', number: '2000-1' },
    );
    expect(text).toBe(
      [
        'Légifrance files no loi numbered 2000-1; these texts carry that number:',
        '- Décret n° 2000-1 du 1er janvier 2000 (1) · DECRET · NOR ABCD0000001D · Published 2000-01-02 · id LEGITEXT000000000001 · https://www.legifrance.gouv.fr/loda/id/LEGITEXT000000000001',
        '- Décret n° 2000-1 du 1er janvier 2000 (2) · DECRET · id LEGITEXT000000000002 · https://www.legifrance.gouv.fr/loda/id/LEGITEXT000000000002',
        'Pass one of these ids to read it.',
      ].join('\n'),
    );
  });

  it('another nature with more matches says so', () => {
    const text = outline(
      {
        kind: 'other_nature',
        input: 'loi organique 2000-1',
        number: '2000-1',
        candidates: [hit(1)],
        more: true,
      },
      { nature: 'loi_organique', number: '2000-1' },
    );
    expect(text).toContain(
      'Légifrance files no loi organique numbered 2000-1; these texts carry that number:',
    );
    expect(text).toContain(
      'Légifrance lists more matches than shown; refine with nature or a Légifrance id.',
    );
  });

  it('not in force with more matches says so', () => {
    const text = outline({
      kind: 'not_in_force',
      input: 'loi 2010-1',
      asOf: TODAY,
      candidates: [candidate()],
      more: true,
    });
    expect(text).toContain(
      'Légifrance lists more matches than shown; refine with nature or a Légifrance id.',
    );
  });

  it('not found echoes what was asked', () => {
    expect(outline({ kind: 'not_found', input: 'loi 2010-1' })).toBe(
      'No loi 2010-1 on Légifrance, in force or not. Check it, or search with legifrance_search_legislation.',
    );
    expect(outline({ kind: 'not_found', input: 'ABCD0000001D' }, { nor: 'ABCD0000001D' })).toBe(
      'No text with NOR ABCD0000001D on Légifrance. Check it, or search with legifrance_search_legislation.',
    );
    expect(
      outline({ kind: 'not_found', input: 'LEGITEXT000000000009' }, { id: 'LEGITEXT000000000009' }),
    ).toBe(
      'No text LEGITEXT000000000009 on Légifrance. Check it, or search with legifrance_search_legislation.',
    );
    expect(
      outline(
        { kind: 'not_found', input: 'loi organique 2001-692' },
        { nature: 'loi_organique', number: '2001-692' },
      ),
    ).toContain('No loi organique 2001-692 on Légifrance, in force or not.');
    expect(
      outline({ kind: 'not_found', input: 'arrete 1' }, { nature: 'arrete', number: '1' }),
    ).toContain('No arrêté 1 on Légifrance');
  });
});

describe('renderGetText: a found text', () => {
  const warning =
    "Légifrance's in-force search did not return this text; its dates say it is in force on 2026-11-12.";

  it('outline: header, warnings, sections with counts and ids, the way to the articles, footer', () => {
    const r = record({
      articles: [article(1)],
      sections: [
        section('LEGISCTA000000000010', 'Titre Ier', {
          articles: [article(2), article(3, { validTo: '2020-01-01', status: 'repealed' })],
          sections: [section('LEGISCTA000000000011', 'Chapitre Ier', { articles: [article(4)] })],
        }),
      ],
    });
    expect(outline(foundText(r, [warning]))).toBe(
      [
        '### Loi n° 2010-1 du 1er janvier 2010 de test\nLOI · Légifrance status: Vigueur\nPublished: 2010-01-02 (Journal officiel publication date)\nVersion in force on 2026-11-12 (consolidated)',
        `⚠️ ${warning}`,
        '4 articles (3 in force on 2026-11-12), 1 outside any section',
        '- Titre Ier · 3 articles (2 in force) · section_id LEGISCTA000000000010\n  - Chapitre Ier · 1 article (1 in force) · section_id LEGISCTA000000000011',
        'Read the article texts with "part": "articles" — the whole text, or one section with its "section_id".',
        'Source: https://www.legifrance.gouv.fr/loda/id/LEGITEXT000000000001\nLégifrance id: LEGITEXT000000000001',
      ].join('\n\n'),
    );
  });

  it('articles: section path when it changes, heading, status line with id, text', () => {
    const r = record({
      articles: [article(1)],
      sections: [section('LEGISCTA000000000010', 'Titre Ier', { articles: [article(2)] })],
    });
    const text = articles(foundText(r));
    expect(text).toContain(
      [
        "#### Art. 1\n✅ In force on 2026-11-12 (since 2010-01-01, no end date) (VIGUEUR) · id LEGIARTI000000000001\nTexte de l'article 1.",
        "Section: Titre Ier\n#### Art. 2\n✅ In force on 2026-11-12 (since 2010-01-01, no end date) (VIGUEUR) · id LEGIARTI000000000002\nTexte de l'article 2.",
      ].join('\n\n'),
    );
    expect(text).toContain('2 articles (2 in force on 2026-11-12) — page 1 of 1');
    expect(text).not.toContain('Next page');
  });

  it('articles of a long text: bounded pages, frame on each, a long article split in parts, text intact', () => {
    const long = Array.from({ length: 2500 }, (_, i) => `Alinéa ${i} de l'article long.`).join(
      '\n',
    );
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
    expect(long.length).toBeGreaterThan(70_000);
    const found = foundText(r, [warning]);
    const first = articles(found);
    const pageCount = Number(/page 1 of (\d+)/.exec(first)?.[1]);
    expect(pageCount).toBeGreaterThan(3);
    const pages = Array.from({ length: pageCount }, (_, i) => articles(found, i + 1));
    const parts: string[] = [];
    for (const [i, page] of pages.entries()) {
      expect(page.length).toBeLessThanOrEqual(MAX_TOOL_TEXT);
      expect(page.startsWith('### Loi n° 2010-1 du 1er janvier 2010 de test')).toBe(true);
      expect(page).toContain(`⚠️ ${warning}`);
      expect(page).toContain(`page ${i + 1} of ${pageCount}`);
      expect(page.includes(`Next page: "page": ${i + 2}`)).toBe(i + 1 < pageCount);
      expect(page).toContain('Source: https://www.legifrance.gouv.fr/loda/id/LEGITEXT000000000001');
      // Every page that starts inside a section says which.
      const firstBlock = page.split('\n\n').find((b) => b.includes('#### Art.'));
      expect(firstBlock?.startsWith('Section: ')).toBe(true);
      for (const m of page.matchAll(
        /#### Art\. 1 bis \(part (\d+) of (\d+)\)\n.+\n([\s\S]*?)(?=\n\n(?:Section: |#### |Next page|Source: )|$)/g,
      )) {
        parts.push(m[3] ?? '');
      }
    }
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.join('')).toBe(long);
    expect(pages.join('\n').match(/^#### Art\. \d+$/gm)).toHaveLength(300);
  });

  it('an article not in force on the date: status, no text', () => {
    const r = record({
      articles: [article(1, { status: 'repealed', rawStatus: 'ABROGE', validTo: '2020-01-01' })],
    });
    expect(articles(foundText(r))).toContain(
      '#### Art. 1\n⛔ Not in force on 2026-11-12: in force 2010-01-01 → 2020-01-01 (ABROGE) · id LEGIARTI000000000001\n(Text not shown: not in force on 2026-11-12. Read it with an "at_date" inside its validity, or with legifrance_get_article and its id.)',
    );
  });

  it('an article with no in-force dates: its text under that label, never ✅, not counted', () => {
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
    const text = articles(foundText(r));
    expect(text).toContain(
      '#### Art. 82\nLégifrance gives no in-force dates for this article (VIGUEUR) · id LEGIARTI000000000082\na modifié les dispositions suivantes',
    );
    expect(text).toContain('2 articles (1 in force on 2026-11-12)');
    expect(text.match(/✅/g)).toHaveLength(1);
    expect(outline(foundText(r))).toContain('2 articles (1 in force on 2026-11-12)');
  });

  it('an article with no start date but an end before the date: ended, text withheld', () => {
    const r = record({
      articles: [article(1, { validFrom: null, validTo: '2020-01-01', rawStatus: 'ABROGE' })],
    });
    expect(articles(foundText(r))).toContain(
      '#### Art. 1\n⛔ Not in force on 2026-11-12: ended 2020-01-01 (ABROGE) · id LEGIARTI000000000001\n(Text not shown: not in force on 2026-11-12.',
    );
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
    const text = articles(found);
    expect(text).toContain(
      'DECRET · Légifrance status: Sans état juridique · NOR ABCD0000001D\nPublished: 2010-01-02 (JORF n°0001 du 2 janvier 2010)\nAs published in the Journal officiel: initial version, later amendments not included',
    );
    expect(text).toContain(
      "#### Art. 1\nAs published · id JORFARTI000000000001\nTexte de l'article 1.",
    );
    expect(text).toContain('1 article — page 1 of 1');
    expect(text).not.toContain('in force');
  });
});
