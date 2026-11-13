import { afterEach, describe, expect, it } from 'vitest';
import { compose } from '../../../src/compose.js';
import type { ChangesView } from '../../../src/services/legislation/changes.js';
import type { ArticleHistoryView } from '../../../src/services/legislation/history.js';
import type {
  ChangeEntry,
  HistoryEntry,
  LegislationHit,
  LegislationSearchPage,
} from '../../../src/services/legislation/ports.js';
import { MAX_TOOL_TEXT } from '../../../src/tools/format.js';
import { renderGetArticleHistory } from '../../../src/tools/legifrance/get-article-history.js';
import { renderListChanges } from '../../../src/tools/legifrance/list-changes.js';
import { askedLine, renderSearch } from '../../../src/tools/legifrance/search-legislation.js';
import { fixtureFetch, sandboxConfig } from '../../helpers/fixture-fetch.js';
import { connectClient, firstText } from '../../helpers/mcp-client.js';

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

async function call(name: string, args: Record<string, unknown>) {
  const fixtures = fixtureFetch();
  unmatchedRoutes.push(fixtures.unmatched);
  const { client, close } = await connectClient(
    compose(sandboxConfig(), { fetch: fixtures.fetch }),
  );
  cleanup.push(close);
  const result = await client.callTool({ name, arguments: args });
  return { result, text: firstText(result) };
}

const TODAY = '2026-11-12';

describe('legifrance_get_article_history (fixtures)', () => {
  it('Code civil 1382: versions, amending text, concordance to 1240', async () => {
    const { result, text } = await call('legifrance_get_article_history', {
      code: 'Code civil',
      number: '1382',
    });
    expect(result.isError).toBeFalsy();
    expect(text).toContain('Ordonnance n°2016-131 du 10 février 2016 - art. 4');
    expect(text).toContain('1240');
    expect(text).toContain('| 1.0 | MODIFIE | 1804-03-21 | 2016-10-01 |');
    expect(text).toContain('| 2.0 | VIGUEUR | 2016-10-01 | no end |');
    expect(text).toContain(
      '- 2016-10-01 — amended by Ordonnance n°2016-131 du 10 février 2016 - art. 4',
    );
    expect(text).toContain('#### Versions');
    // The 1240 link belongs to version 1.0 (the tort text), not to the article as a whole.
    expect(text).toContain(
      'Per Légifrance concordance — content formerly at art. 1382 (until 2016-10-01) now at: Code civil - art. 1240 (V)',
    );
    expect(text).toContain(
      'Per Légifrance concordance — content now at art. 1382 came from: Code civil - art. 1353 (M)',
    );
    expect(text.match(/art\. 1240/g)).toHaveLength(1);
    expect(text).not.toContain('Content moved to:');
    expect(text).toContain('Source: https://www.legifrance.gouv.fr/codes/article_lc/');
  });

  it('an ambiguous citation renders like get_article', async () => {
    const { result, text } = await call('legifrance_get_article_history', { number: 'L1234-1' });
    expect(result.isError).toBeFalsy();
    expect(text).toContain('Article L1234-1 exists in several codes — call again with "code":');
    expect(result.structuredContent).toBeUndefined();
  });

  it('an unknown code renders like get_article', async () => {
    const { result, text } = await call('legifrance_get_article_history', {
      code: 'C. route',
      number: 'R413-17',
    });
    expect(result.isError).toBeFalsy();
    expect(text).toContain('Unknown code "C. route": no Légifrance code has this title.');
  });

  it('blank inputs count as absent', async () => {
    const { result, text } = await call('legifrance_get_article_history', {
      code: ' ',
      number: 'L1234-1',
      id: '',
    });
    expect(result.isError).toBeFalsy();
    expect(text).toContain('exists in several codes');
  });
});

const hit = (n: number): LegislationHit => ({
  kind: 'article',
  id: `LEGIARTI${String(n).padStart(12, '0')}`,
  textId: 'LEGITEXT000006070721',
  title: 'Code civil',
  articleNumber: String(n),
  status: 'in_force',
  rawStatus: 'VIGUEUR',
  validFrom: '2016-10-01',
  validTo: null,
  snippet: 'x'.repeat(5_000),
  nature: null,
  publishedOn: null,
  nor: null,
});

describe('legifrance_search_legislation (fixtures)', () => {
  it('codes + article number finds art. 1240 with its id', async () => {
    const { result, text } = await call('legifrance_search_legislation', {
      collection: 'codes',
      code: 'Code civil',
      article_number: '1240',
    });
    expect(result.isError).toBeFalsy();
    expect(text).toContain('art. 1240');
    expect(text).toContain('LEGIARTI000032041571');
    expect(text).toContain(
      '(Counts include texts filtered out by the article number; showing matches only.)',
    );
    expect(text).toContain('Searched codes');
  });

  it('no criterion is an error', async () => {
    const { result } = await call('legifrance_search_legislation', { collection: 'codes' });
    expect(result.isError).toBe(true);
  });

  it('page_size 51 is an error', async () => {
    const { result } = await call('legifrance_search_legislation', {
      collection: 'codes',
      code: 'Code civil',
      page_size: 51,
    });
    expect(result.isError).toBe(true);
  });

  it('a page of 50 long hits stays under the text cap, both modes', () => {
    const page: LegislationSearchPage = {
      total: 500,
      page: 1,
      pageSize: 50,
      hits: Array.from({ length: 50 }, (_, i) => ({
        ...hit(i + 1),
        title: `Convention collective nationale ${'très longue '.repeat(10)}${i}`,
      })),
    };
    for (const detailed of [false, true]) {
      const text = renderSearch(page, {
        detailed,
        asked: 'Searched codes',
        filteredByArticleNumber: false,
      });
      expect(text.length).toBeLessThanOrEqual(MAX_TOOL_TEXT);
      expect(text).toContain('Next page: "page": 2');
    }
  });

  it('every hit line carries its official link, concise or detailed', () => {
    for (const detailed of [false, true]) {
      const text = renderSearch(
        { total: 1, page: 1, pageSize: 10, hits: [hit(1)] },
        { detailed, asked: 'a', filteredByArticleNumber: false },
      );
      expect(text).toContain(
        '- Code civil — art. 1 · VIGUEUR · 2016-10-01 → no end · id LEGIARTI000000000001 · https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000000000001',
      );
      expect(text).toContain('Use legifrance_get_article with a hit id');
    }
  });

  it('a JORF text hit renders its status as "as published", not "unknown"', () => {
    const jorfText: LegislationHit = {
      ...hit(1),
      kind: 'text',
      id: 'JORFTEXT000033934937',
      textId: 'JORFTEXT000033934937',
      title: 'Décret n° 2017-23 du 11 janvier 2017',
      status: 'unknown',
      rawStatus: '',
      validFrom: null,
      snippet: null,
    };
    const text = renderSearch(
      { total: 1, page: 1, pageSize: 10, hits: [jorfText] },
      { detailed: false, asked: 'a', filteredByArticleNumber: false },
    );
    const line = text.split('\n').find((l) => l.includes('JORFTEXT000033934937')) ?? '';
    expect(line).toContain('as published');
    expect(line).not.toContain('unknown');
  });

  it('a JORF article hit links to the JO article and is not offered to get_article', () => {
    const jorfArticle: LegislationHit = {
      ...hit(1),
      id: 'JORFARTI000033934948',
      textId: 'JORFTEXT000033934937',
      title: 'Décret n° 2017-23 du 11 janvier 2017',
      status: 'initial',
      rawStatus: 'INITIALE',
      validFrom: null,
      snippet: null,
    };
    const text = renderSearch(
      { total: 1, page: 1, pageSize: 10, hits: [jorfArticle] },
      { detailed: false, asked: 'a', filteredByArticleNumber: false },
    );
    expect(text).toContain('https://www.legifrance.gouv.fr/jorf/article_jo/JORFARTI000033934948');
    expect(text).not.toContain('codes/article_lc/JORFARTI');
    expect(text).not.toContain('legifrance_get_article');
  });

  it('a code article hit from the fixtures carries its link in concise mode', async () => {
    const { result, text } = await call('legifrance_search_legislation', {
      collection: 'codes',
      code: 'Code civil',
      article_number: '1240',
    });
    expect(result.isError).toBeFalsy();
    expect(text).toContain(
      'id LEGIARTI000032041571 · https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032041571',
    );
  });

  it('states the scope each collection really has', () => {
    const at = (args: Parameters<typeof askedLine>[0]) => askedLine(args, TODAY);
    expect(at({ collection: 'codes', query: 'x' })).toBe(
      'Searched codes · query "x" · in force on 2026-11-12',
    );
    expect(at({ collection: 'loda', query: 'x', at_date: '2015-01-01' })).toBe(
      'Searched loda · query "x" · in force on 2015-01-01',
    );
    expect(at({ collection: 'jorf', nor: 'JUSC1522466R' })).toBe(
      'Searched jorf · NOR "JUSC1522466R" · as published',
    );
    expect(at({ collection: 'jorf', nor: 'JUSC1522466R', include_historical: true })).toBe(
      'Searched jorf · NOR "JUSC1522466R" · as published',
    );
    expect(at({ collection: 'kali', idcc: '1486' })).toBe(
      'Searched kali · IDCC "1486" · currently in force (extended or not)',
    );
    expect(at({ collection: 'kali', idcc: '1486', include_historical: true })).toBe(
      'Searched kali · IDCC "1486" · all versions',
    );
    expect(at({ collection: 'codes', query: 'x', include_historical: true })).toBe(
      'Searched codes · query "x" · all versions',
    );
  });

  it('rejects at_date on kali with guidance, as a tool error', async () => {
    const { result, text } = await call('legifrance_search_legislation', {
      collection: 'kali',
      idcc: '1486',
      at_date: '2015-01-01',
    });
    expect(result.isError).toBe(true);
    expect(text).toContain('"at_date" does not apply to the kali collection');
  });

  it('the description matches the criteria rule and the per-collection scope', async () => {
    const fixtures = fixtureFetch();
    unmatchedRoutes.push(fixtures.unmatched);
    const { client, close } = await connectClient(
      compose(sandboxConfig(), { fetch: fixtures.fetch }),
    );
    cleanup.push(close);
    const tool = (await client.listTools()).tools.find(
      (t) => t.name === 'legifrance_search_legislation',
    );
    const description = tool?.description ?? '';
    expect(description).toContain(
      'Give at least one of query, article_number, text_number, nor or idcc',
    );
    expect(description).not.toContain('or a publication date range)');
    expect(description).toContain('"jorf" results are texts as published');
    expect(description).toContain('"kali" results are the agreements currently in force');
  });

  it('concise snippets stop at 200 characters', () => {
    const text = renderSearch(
      { total: 1, page: 1, pageSize: 10, hits: [hit(1)] },
      { detailed: false, asked: 'a', filteredByArticleNumber: false },
    );
    expect(text).not.toContain('x'.repeat(201));
    expect(text).toContain('x'.repeat(190));
  });
});

describe('legifrance_list_changes (fixtures)', () => {
  it('Code civil 2025-2026 lists the amending text and article 61-3-1', async () => {
    const { result, text } = await call('legifrance_list_changes', {
      code: 'Code civil',
      since: '2025-01-01',
      until: '2026-12-31',
    });
    expect(result.isError).toBeFalsy();
    expect(text).toContain('LOI n°2026-667 du 27 juillet 2026 - art. 7');
    expect(text).toContain('61-3-1');
    expect(text).toContain('entry-into-force dates');
  });

  it('a bad date is an error', async () => {
    const { result } = await call('legifrance_list_changes', {
      code: 'Code civil',
      since: '2025-13-01',
    });
    expect(result.isError).toBe(true);
  });
});

function syntheticChanges(n: number, groups = 60): ChangesView {
  const entries: ChangeEntry[] = Array.from({ length: n }, (_, i) => ({
    date: i < n - 3 ? '2026-01-01' : '2027-01-01',
    action: 'modification',
    articleNum: `L${1000 + i}-1`,
    articleId: `LEGIARTI${String(i).padStart(12, '0')}`,
    sectionTitle: `Section ${'s'.repeat(120)} ${i}`,
    amendingTitle: `Loi n°${i % groups} ${'t'.repeat(80)}`,
    amendingArticleId: null,
  }));
  const byTitle = new Map<string, ChangeEntry[]>();
  for (const e of entries)
    byTitle.set(e.amendingTitle, [...(byTitle.get(e.amendingTitle) ?? []), e]);
  return {
    textTitle: 'Code du travail',
    textId: 'LEGITEXT000006072050',
    since: '2026-01-01',
    until: '2027-12-31',
    groups: [...byTitle].map(([amendingTitle, es]) => ({ amendingTitle, entries: es })),
    scheduledCount: 3,
    undeterminedCount: 2,
    detailMissingYears: ['2027'],
    totalEntries: n,
  };
}

describe('list changes paging', () => {
  it('250 entries: page 1 shows 100 with a Next page hint, text under the cap', () => {
    const view = syntheticChanges(250);
    const p1 = renderListChanges(view, { detailed: false, today: TODAY, page: 1 });
    expect(p1.split('\n').filter((l) => l.startsWith('- ')).length).toBe(100);
    expect(p1).toContain('Next page: "page": 2');
    expect(p1.length).toBeLessThanOrEqual(MAX_TOOL_TEXT);
    expect(p1).toContain('250 entries in');
    expect(p1).toContain('page 1 of 3');
    expect(p1).toContain('### Code du travail — changes from 2026-01-01 to 2027-12-31');

    const p3 = renderListChanges(view, { detailed: false, today: TODAY, page: 3 });
    expect(p3.split('\n').filter((l) => l.startsWith('- ')).length).toBe(50);
    expect(p3).not.toContain('Next page');
    const allText = [1, 2, 3]
      .map((page) => renderListChanges(view, { detailed: false, today: TODAY, page }))
      .join('\n');
    expect(allText.match(/\(scheduled\)/g)?.length).toBe(3);
    expect(p3).toContain('2 versions in this range have an entry-into-force date');
    expect(p3).toContain('has not loaded the version detail for 2027');
    expect(p3).toContain('### Code du travail — changes from');
  });

  it('entry lines show the article id and the header links the code', () => {
    const text = renderListChanges(syntheticChanges(5), { detailed: false, today: TODAY, page: 1 });
    expect(text).toContain('· id LEGIARTI');
    const view = { ...syntheticChanges(5), textId: 'LEGITEXT000006070721' };
    expect(renderListChanges(view, { detailed: false, today: TODAY, page: 1 })).toContain(
      'https://www.legifrance.gouv.fr/codes/texte_lc/LEGITEXT000006070721',
    );
  });

  it('a page past the end is an error from the tool', async () => {
    const view = syntheticChanges(5);
    expect(() => renderListChanges(view, { detailed: false, today: TODAY, page: 2 })).toThrow(
      /past the last page/,
    );
  });

  it('every page stays under the cap even with huge titles', () => {
    const view = syntheticChanges(300, 300);
    for (const g of view.groups) g.amendingTitle = 'T'.repeat(600);
    for (let page = 1; page <= 3; page++) {
      const r = renderListChanges(view, { detailed: true, today: TODAY, page });
      expect(r.length).toBeLessThanOrEqual(MAX_TOOL_TEXT);
    }
  });
});

function syntheticHistory(events: number): ArticleHistoryView {
  const list: HistoryEntry[] = Array.from({ length: events }, (_, i) => ({
    date: i === 0 ? null : '2020-01-01',
    undetermined: i === 0,
    action: 'modification',
    amendingTitle: `Loi n°${i} ${'t'.repeat(40)}`,
    amendingArticleId: null,
  }));
  return {
    kind: 'history',
    codeTitle: 'Code civil',
    num: '1',
    current: {
      id: 'LEGIARTI000000000001',
      version: '3.0',
      status: 'in_force',
      rawStatus: 'VIGUEUR',
      validFrom: '2020-01-01',
      validTo: null,
      validToUndetermined: false,
    },
    versions: [
      {
        id: 'LEGIARTI000000000001',
        version: '3.0',
        status: 'in_force',
        rawStatus: 'VIGUEUR',
        validFrom: '2020-01-01',
        validTo: null,
        validToUndetermined: false,
      },
    ],
    events: list,
    concordance: {
      from: [],
      moved: [
        {
          version: {
            id: 'LEGIARTI000000000001',
            version: '3.0',
            status: 'in_force',
            rawStatus: 'VIGUEUR',
            validFrom: '2020-01-01',
            validTo: null,
            validToUndetermined: false,
          },
          to: [
            {
              id: 'LEGIARTI000000000002',
              num: '2',
              codeTitle: 'Code civil',
              label: 'Code civil, art. 2',
            },
          ],
        },
      ],
    },
    warnings: [],
  };
}

describe('article history paging', () => {
  it('500 events: pages of at most 100, each self-describing and under the cap', () => {
    const view = syntheticHistory(500);
    const opts = { detailed: false, today: TODAY, requestedId: null };
    const p1 = renderGetArticleHistory(view, { ...opts, page: 1 });
    expect(p1.length).toBeLessThanOrEqual(MAX_TOOL_TEXT);
    expect(p1).toContain('Next page: "page": 2');
    expect(p1).toContain('date not determined — amended by Loi n°0');
    expect(p1).toContain(
      'Per Légifrance concordance — content formerly at art. 1 (version since 2020-01-01) now at: Code civil, art. 2',
    );
    expect(p1).toContain('(500 in total, page 1 of 5)');

    const p5 = renderGetArticleHistory(view, { ...opts, page: 5 });
    expect(p5).not.toContain('Next page');
    expect(p5).toContain(
      'Source: https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000000000001',
    );
    expect(p5).toContain('#### Versions');
  });

  it('shows the end of the current version, including an undetermined one', () => {
    const opts = { detailed: false, today: TODAY, requestedId: null, page: 1 };
    const open = renderGetArticleHistory(syntheticHistory(1), opts);
    expect(open).toContain(
      'In force today (computed from validity dates): version 3.0, since 2020-01-01, no end date.',
    );
    const view = syntheticHistory(1);
    const pending = {
      ...view.versions[0],
      id: 'LEGIARTI000000000001',
      version: '3.0',
      status: 'repeal_pending' as const,
      rawStatus: 'ABROGE_DIFF',
      validFrom: '2020-01-01',
      validTo: null,
      validToUndetermined: true,
    };
    const text = renderGetArticleHistory({ ...view, current: pending, versions: [pending] }, opts);
    expect(text).toContain(
      'In force today (computed from validity dates): version 3.0, since 2020-01-01, until a date not yet determined.',
    );
    expect(text).toContain('| 3.0 | ABROGE_DIFF | 2020-01-01 | not yet determined |');
  });

  it('scopes each concordance line to the version it describes (Code civil 1240)', () => {
    const version = (id: string, v: string, from: string, to: string | null) => ({
      id,
      version: v,
      status: to === null ? ('in_force' as const) : ('amended' as const),
      rawStatus: to === null ? 'VIGUEUR' : 'MODIFIE',
      validFrom: from,
      validTo: to,
      validToUndetermined: false,
    });
    const payment = version('LEGIARTI000006437044', '1.0', '1804-03-21', '2016-10-01');
    const tort = version('LEGIARTI000032041571', '2.0', '2016-10-01', null);
    const civ = (id: string, num: string, flag: string) => ({
      id,
      num,
      codeTitle: 'Code civil',
      label: `Code civil - art. ${num} (${flag})`,
    });
    const view: ArticleHistoryView = {
      kind: 'history',
      codeTitle: 'Code civil',
      num: '1240',
      current: tort,
      versions: [payment, tort],
      events: [],
      concordance: {
        from: [civ('LEGIARTI000006438819', '1382', 'M')],
        moved: [{ version: payment, to: [civ('LEGIARTI000032035241', '1342-3', 'V')] }],
      },
      warnings: [],
    };
    const text = renderGetArticleHistory(view, {
      detailed: false,
      today: TODAY,
      requestedId: null,
      page: 1,
    });
    expect(text).toContain(
      [
        '#### Concordance',
        'Per Légifrance concordance — content formerly at art. 1240 (until 2016-10-01) now at: Code civil - art. 1342-3 (V)',
        'Per Légifrance concordance — content now at art. 1240 came from: Code civil - art. 1382 (M)',
      ].join('\n'),
    );
  });

  it('shows the warnings of a partial answer', () => {
    const view = {
      ...syntheticHistory(1),
      warnings: ["Could not read Légifrance's concordance of LEGIARTI000000000001 (fetch failed)."],
    };
    const text = renderGetArticleHistory(view, {
      detailed: false,
      today: TODAY,
      requestedId: null,
      page: 1,
    });
    expect(text).toContain(
      "⚠️ Could not read Légifrance's concordance of LEGIARTI000000000001 (fetch failed).",
    );
  });

  it('events whose lines are very long page by size, not only by count', () => {
    const view = syntheticHistory(100);
    for (const e of view.events) e.amendingTitle = 'z'.repeat(3_000);
    const p1 = renderGetArticleHistory(view, {
      detailed: false,
      today: TODAY,
      requestedId: null,
      page: 1,
    });
    expect(p1.length).toBeLessThanOrEqual(MAX_TOOL_TEXT);
    expect(p1).toContain('Next page');
  });
});
