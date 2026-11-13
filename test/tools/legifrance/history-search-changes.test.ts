import { afterEach, describe, expect, expectTypeOf, it } from 'vitest';
import type * as z from 'zod/v4';
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
import {
  type ArticleHistoryOutput,
  articleHistoryOutputSchema,
  type ChangesOutput,
  changesOutputSchema,
  type SearchOutput,
  searchOutputSchema,
} from '../../../src/tools/legifrance/schemas.js';
import { renderSearch } from '../../../src/tools/legifrance/search-legislation.js';
import { fixtureFetch, sandboxConfig } from '../../helpers/fixture-fetch.js';
import { connectClient, firstText } from '../../helpers/mcp-client.js';

let cleanup: Array<() => Promise<void>> = [];
let unmatchedRoutes: string[][] = [];

afterEach(async () => {
  for (const close of cleanup.reverse()) await close();
  cleanup = [];
  for (const unmatched of unmatchedRoutes)
    expect(unmatched, 'requests without a fixture').toEqual([]);
  unmatchedRoutes = [];
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
const JSON_LIMIT = 20_000;

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
    expect(articleHistoryOutputSchema.safeParse(result.structuredContent).success).toBe(true);
  });

  it('an ambiguous citation renders like get_article', async () => {
    const { result, text } = await call('legifrance_get_article_history', { number: 'L1234-1' });
    expect(result.isError).toBeFalsy();
    expect(text).toContain('Article L1234-1 exists in several codes — call again with "code":');
    expect((result.structuredContent as { kind: string }).kind).toBe('ambiguous');
  });

  it('an unknown code renders like get_article', async () => {
    const { result, text } = await call('legifrance_get_article_history', {
      code: 'C. route',
      number: 'R413-17',
    });
    expect(result.isError).toBeFalsy();
    expect(text).toContain('Unknown code "C. route": no Légifrance code has this title.');
    expect(result.structuredContent).toMatchObject({ kind: 'not_found', reason: 'unknown_code' });
    expect(articleHistoryOutputSchema.safeParse(result.structuredContent).success).toBe(true);
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
    expect(searchOutputSchema.safeParse(result.structuredContent).success).toBe(true);
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

  it('a page of 50 long hits stays small in text and structured output, both modes', () => {
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
      const { text, output } = renderSearch(page, {
        detailed,
        asked: 'Searched codes',
        filteredByArticleNumber: false,
      });
      expect(text.length).toBeLessThanOrEqual(MAX_TOOL_TEXT);
      expect(JSON.stringify(output).length).toBeLessThan(JSON_LIMIT);
      expect(text).toContain('Next page: "page": 2');
    }
  });

  it('concise snippets stop at 200 characters', () => {
    const { text } = renderSearch(
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
    expect(changesOutputSchema.safeParse(result.structuredContent).success).toBe(true);
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
  it('250 entries: page 1 shows 100 with a Next page hint, small outputs', () => {
    const view = syntheticChanges(250);
    const p1 = renderListChanges(view, { detailed: false, today: TODAY, page: 1 });
    expect(p1.output.groups.reduce((n, g) => n + g.entries.length, 0)).toBe(100);
    expect(p1.text).toContain('Next page: "page": 2');
    expect(p1.text.length).toBeLessThanOrEqual(MAX_TOOL_TEXT);
    expect(JSON.stringify(p1.output).length).toBeLessThan(JSON_LIMIT);
    expect(p1.output.paging).toEqual({ page: 1, pageSize: 100, total: 250, hasMore: true });
    expect(p1.text).toContain('### Code du travail — changes from 2026-01-01 to 2027-12-31');

    const p3 = renderListChanges(view, { detailed: false, today: TODAY, page: 3 });
    expect(p3.output.groups.reduce((n, g) => n + g.entries.length, 0)).toBe(50);
    expect(p3.text).not.toContain('Next page');
    const allText = [1, 2, 3]
      .map((page) => renderListChanges(view, { detailed: false, today: TODAY, page }).text)
      .join('\n');
    expect(allText.match(/\(scheduled\)/g)?.length).toBe(3);
    expect(p3.text).toContain('2 versions in this range have an entry-into-force date');
    expect(p3.text).toContain('has not loaded the version detail for 2027');
    expect(p3.text).toContain('### Code du travail — changes from');
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
      expect(r.text.length).toBeLessThanOrEqual(MAX_TOOL_TEXT);
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
    expect(p1.text.length).toBeLessThanOrEqual(MAX_TOOL_TEXT);
    expect(p1.text).toContain('Next page: "page": 2');
    expect(p1.text).toContain('date not determined — amended by Loi n°0');
    expect(p1.text).toContain(
      'Per Légifrance concordance — content formerly at art. 1 (version since 2020-01-01) now at: Code civil, art. 2',
    );
    expect(JSON.stringify(p1.output).length).toBeLessThan(JSON_LIMIT);
    const out = p1.output;
    if (out.kind !== 'history') throw new Error('expected history');
    expect(out.history.events.length).toBe(100);
    expect(out.paging).toEqual({ page: 1, pageSize: 100, total: 500, hasMore: true });

    const p5 = renderGetArticleHistory(view, { ...opts, page: 5 });
    expect(p5.text).not.toContain('Next page');
    expect(p5.text).toContain(
      'Source: https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000000000001',
    );
    expect(p5.text).toContain('#### Versions');
  });

  it('shows the end of the current version, including an undetermined one', () => {
    const opts = { detailed: false, today: TODAY, requestedId: null, page: 1 };
    const open = renderGetArticleHistory(syntheticHistory(1), opts).text;
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
    const text = renderGetArticleHistory(
      { ...view, current: pending, versions: [pending] },
      opts,
    ).text;
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
    const { text, output } = renderGetArticleHistory(view, {
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
    expect(articleHistoryOutputSchema.safeParse(output).success).toBe(true);
  });

  it('shows the warnings of a partial answer', () => {
    const view = {
      ...syntheticHistory(1),
      warnings: ["Could not read Légifrance's concordance of LEGIARTI000000000001 (fetch failed)."],
    };
    const { text, output } = renderGetArticleHistory(view, {
      detailed: false,
      today: TODAY,
      requestedId: null,
      page: 1,
    });
    expect(text).toContain(
      "⚠️ Could not read Légifrance's concordance of LEGIARTI000000000001 (fetch failed).",
    );
    expect(articleHistoryOutputSchema.safeParse(output).success).toBe(true);
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
    expect(p1.text.length).toBeLessThanOrEqual(MAX_TOOL_TEXT);
    expect(p1.text).toContain('Next page');
  });
});

describe('output schemas', () => {
  it('mirror the output types exactly', () => {
    expectTypeOf<
      z.infer<typeof articleHistoryOutputSchema>
    >().toEqualTypeOf<ArticleHistoryOutput>();
    expectTypeOf<z.infer<typeof searchOutputSchema>>().toEqualTypeOf<SearchOutput>();
    expectTypeOf<z.infer<typeof changesOutputSchema>>().toEqualTypeOf<ChangesOutput>();
  });
});
