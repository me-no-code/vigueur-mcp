import { afterEach, describe, expect, it } from 'vitest';
import { createLegifranceClient } from '../../../src/clients/legifrance/client.js';
import { compose } from '../../../src/compose.js';
import {
  createLatestJo,
  type LatestJoView,
  type ReferenceView,
} from '../../../src/services/legislation/jo.js';
import type { JoIssue, JoText } from '../../../src/services/legislation/ports.js';
import { MAX_TOOL_TEXT } from '../../../src/tools/format.js';
import { renderLatestJo } from '../../../src/tools/legifrance/latest-jo.js';
import { renderReferenceValues } from '../../../src/tools/legifrance/reference-values.js';
import { fakePisteHttp } from '../../helpers/fake-piste-http.js';
import { fixtureFetch, sandboxConfig } from '../../helpers/fixture-fetch.js';
import { connectClient, firstText } from '../../helpers/mcp-client.js';

let cleanup: Array<() => Promise<void>> = [];
let unmatchedRoutes: string[][] = [];

afterEach(async () => {
  for (const close of cleanup.reverse()) await close();
  cleanup = [];
  const pending = unmatchedRoutes;
  unmatchedRoutes = [];
  for (const unmatched of pending) expect(unmatched, 'requests without a fixture').toEqual([]);
});

async function call(name: string, args: Record<string, unknown>) {
  const fixtures = fixtureFetch();
  unmatchedRoutes.push(fixtures.unmatched);
  const { client, close } = await connectClient(
    compose(sandboxConfig(), { fetch: fixtures.fetch, today: () => '2026-11-13' }),
  );
  cleanup.push(close);
  const result = await client.callTool({ name, arguments: args });
  return { result, text: firstText(result) };
}

describe('legifrance_latest_jo (fixture 47)', () => {
  it('default: the latest issue with its publication date, link and JORFTEXT links', async () => {
    const { result, text } = await call('legifrance_latest_jo', {});
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toBeUndefined();
    expect(text).toContain('### JORF n°0264 du 11 novembre 2026');
    expect(text).toContain('Published 2026-11-11');
    expect(text).toContain('https://www.legifrance.gouv.fr/eli/jo/2026/11/11/0264');
    expect(text).toContain('https://www.legifrance.gouv.fr/jorf/id/JORFTEXT');
    expect(text).toContain('Dates are publication dates');
    expect(text).toContain('Source: https://www.legifrance.gouv.fr/eli/jo/2026/11/11/0264');
    expect(text.length).toBeLessThanOrEqual(MAX_TOOL_TEXT);
  });

  it('count 3 stays under the cap and every page repeats the frame', async () => {
    const first = await call('legifrance_latest_jo', { count: 3 });
    expect(first.text.length).toBeLessThanOrEqual(MAX_TOOL_TEXT);
    expect(first.text).toContain('Source: ');
    const pages = /page 1 of (\d+)/.exec(first.text)?.[1];
    for (let p = 2; p <= Number(pages); p++) {
      const { text } = await call('legifrance_latest_jo', { count: 3, page: p });
      expect(text.length).toBeLessThanOrEqual(MAX_TOOL_TEXT);
      expect(text).toContain(`page ${p} of ${pages}`);
      expect(text).toContain('Source: ');
    }
  });

  it('nature "decret" keeps only DECRET lines and says so', async () => {
    const { text } = await call('legifrance_latest_jo', { nature: 'decret' });
    const lines = text.split('\n').filter((l) => l.startsWith('- '));
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) expect(l).toContain(' · DECRET · ');
    expect(text).toContain('Filters: nature "decret"');
  });

  it('an emitter with no match keeps the issue, says nothing matches and lists the available values', async () => {
    const { result, text } = await call('legifrance_latest_jo', { emitter: 'zzzz-nobody' });
    expect(result.isError).toBeFalsy();
    expect(text).toContain('### JORF n°0264 du 11 novembre 2026');
    expect(text).toContain('Published 2026-11-11');
    expect(text).toContain('No text matches these filters in the selected issue(s).');
    expect(text).toMatch(/Natures available in these issues: \S/);
    expect(text).toMatch(/Emitters available in these issues: \S/);
    const emitters = /Emitters available in these issues: (.*)\./.exec(text)?.[1] ?? '';
    expect(emitters.split('; ').length).toBeLessThanOrEqual(11);
  });

  it('an emitter filter lists the matched spellings', async () => {
    const all = await call('legifrance_latest_jo', {});
    const ministry = /· ([^·\n]*[Mm]inist[^·\n]*) · https/.exec(all.text)?.[1];
    expect(ministry).toBeDefined();
    const word = (ministry ?? '').split(' ').find((w) => w.length > 5) ?? '';
    const { text } = await call('legifrance_latest_jo', { emitter: word });
    expect(text).toContain('Matched emitters: ');
  });

  it('a page past the end and a bad count are errors', async () => {
    expect((await call('legifrance_latest_jo', { page: 99 })).result.isError).toBe(true);
    expect((await call('legifrance_latest_jo', { count: 11 })).result.isError).toBe(true);
  });
});

function jo(n: number): LatestJoView {
  const texts: JoText[] = Array.from({ length: n }, (_, i) => ({
    id: `JORFTEXT${String(i).padStart(12, '0')}`,
    title: `Arrêté ${'t'.repeat(300)} ${i}`,
    nature: 'ARRETE',
    ministry: 'Ministère',
    emitter: null,
  }));
  const issue: JoIssue = {
    id: 'JORFCONT000000000001',
    title: 'JORF n°0001',
    number: '0001',
    publishedOn: '2026-01-01',
    eliPath: '/eli/jo/2026/01/01/0001',
    groups: [{ path: ['A', 'B'], texts }],
  };
  return {
    issues: [issue],
    filter: { nature: null, emitter: null, matchedEmitters: [] },
    totalTexts: n,
    available: { natures: ['ARRETE'], emitters: ['Ministère'] },
  };
}

/** All pages of a view, following the page count of the first. */
function allPages(view: LatestJoView): string[] {
  const first = renderLatestJo(view, { page: 1 });
  const count = Number(/page 1 of (\d+)/.exec(first)?.[1]);
  return Array.from({ length: count }, (_, i) => renderLatestJo(view, { page: i + 1 }));
}

describe('legifrance_latest_jo, fixture 47 read as production answers count 1', () => {
  // Fixture 47 was recorded with nbElement 3; production answers nbElement 1 with the latest
  // issue only (JORF n°0264, 108 texts): the view is built from that one issue.
  async function latestIssue(): Promise<LatestJoView> {
    const client = createLegifranceClient(
      fakePisteHttp([{ path: '/consult/lastNJo', fixture: '47-lastNJo-3' }]).http,
    );
    const repo = {
      ...client,
      latestJo: async (count: number) => (await client.latestJo(count)).slice(0, count),
    };
    return createLatestJo(repo)({ count: 1 });
  }

  it('fits in one page under the cap', async () => {
    const view = await latestIssue();
    expect(view.issues.map((i) => i.title)).toEqual(['JORF n°0264 du 11 novembre 2026']);
    expect(view.totalTexts).toBe(108);
    const text = renderLatestJo(view, { page: 1 });
    expect(text).toContain('— page 1 of 1.');
    expect(text.length).toBeLessThanOrEqual(MAX_TOOL_TEXT);
    expect(text).not.toContain('Next page');
    expect(text.split('\n').filter((l) => l.startsWith('- '))).toHaveLength(108);
  });
});

describe('renderLatestJo paging', () => {
  it('a huge issue splits into pages under the cap, each with header, group path and source', () => {
    const view = jo(400);
    const first = renderLatestJo(view, { page: 1 });
    const count = Number(/page 1 of (\d+)/.exec(first)?.[1]);
    expect(count).toBeGreaterThan(1);
    let lines = 0;
    for (let p = 1; p <= count; p++) {
      const t = renderLatestJo(view, { page: p });
      expect(t.length).toBeLessThanOrEqual(MAX_TOOL_TEXT);
      expect(t).toContain('### JORF n°0001');
      expect(t).toContain('#### A › B');
      expect(t).toContain('Source: https://www.legifrance.gouv.fr/eli/jo/2026/01/01/0001');
      lines += t.split('\n').filter((l) => l.startsWith('- ')).length;
    }
    expect(lines).toBe(400);
  });

  it('many groups and issues: pages stay under the cap and well filled, every text once', () => {
    const issue = (n: number): JoIssue => ({
      id: `JORFCONT00000000000${n}`,
      title: `JORF n°000${n} du ${n} janvier 2026`,
      number: `000${n}`,
      publishedOn: `2026-01-0${n}`,
      eliPath: `/eli/jo/2026/01/0${n}/000${n}`,
      groups: Array.from({ length: 40 }, (_, g) => ({
        path: [`Ministère ${'m'.repeat(80)} ${g}`, `Direction ${'d'.repeat(80)} ${g}`],
        texts: Array.from({ length: 1 + (g % 4) }, (_, i) => ({
          id: `JORFTEXT${String(n * 10_000 + g * 10 + i).padStart(12, '0')}`,
          title: `Décret ${'t'.repeat(200)} ${n}-${g}-${i}`,
          nature: 'DECRET',
          ministry: `Ministère ${g}`,
          emitter: null,
        })),
      })),
    });
    const issues = [issue(1), issue(2), issue(3)];
    const total = issues.flatMap((i) => i.groups ?? []).reduce((n, g) => n + g.texts.length, 0);
    const view: LatestJoView = {
      issues,
      filter: {
        nature: 'decret',
        emitter: 'minist',
        matchedEmitters: Array.from({ length: 40 }, (_, i) => `Ministère ${'x'.repeat(90)} ${i}`),
      },
      totalTexts: total,
      available: { natures: ['DECRET'], emitters: [] },
    };
    const pages = allPages(view);
    expect(pages.length).toBeGreaterThan(2);
    const ids: string[] = [];
    for (const [i, page] of pages.entries()) {
      expect(page.length).toBeLessThanOrEqual(MAX_TOOL_TEXT);
      if (i < pages.length - 1) expect(page.length).toBeGreaterThan(MAX_TOOL_TEXT * 0.9);
      expect(page).toMatch(/^### JORF n°000\d/m);
      expect(
        page
          .split('\n\n')
          .find((b) => b.includes('\n- '))
          ?.startsWith('#### '),
      ).toBe(true);
      expect(page).toContain('Source: https://www.legifrance.gouv.fr/eli/jo/2026/01/0');
      ids.push(...[...page.matchAll(/jorf\/id\/(JORFTEXT\d{12})/g)].map((m) => m[1] as string));
    }
    expect(ids).toHaveLength(total);
    expect(new Set(ids).size).toBe(total);
  });
});

describe('legifrance_list_reference_values', () => {
  it('codes: title, status and id', async () => {
    const { result, text } = await call('legifrance_list_reference_values', { kind: 'codes' });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toBeUndefined();
    expect(text).toMatch(/^- Code civil · .* · id LEGITEXT000006070721$/m);
    expect(text.length).toBeLessThanOrEqual(MAX_TOOL_TEXT);
    expect(text).toContain('Source: https://www.legifrance.gouv.fr');
  });

  it('jorf_natures: value and count, dated as publication dates', async () => {
    const { text } = await call('legifrance_list_reference_values', { kind: 'jorf_natures' });
    expect(text).toMatch(/^- DECRET · \d+ texts$/m);
    expect(text).toContain('publication dates');
    expect(text).toContain('since 2025-11-13');
  });

  it('jorf_emitters honours since', async () => {
    const { text } = await call('legifrance_list_reference_values', {
      kind: 'jorf_emitters',
      since: '2026-01-01',
    });
    expect(text).toContain('since 2026-01-01');
    expect(text).toMatch(/^- .+ · \d+ texts$/m);
  });

  it('a bad kind or a future since is an error', async () => {
    expect((await call('legifrance_list_reference_values', { kind: 'x' })).result.isError).toBe(
      true,
    );
    expect(
      (
        await call('legifrance_list_reference_values', {
          kind: 'jorf_natures',
          since: '2030-01-01',
        })
      ).result.isError,
    ).toBe(true);
  });

  it('a very long list is cut under the cap with a notice', () => {
    const view: ReferenceView = {
      kind: 'jorf_emitters',
      since: '2026-01-01',
      values: Array.from({ length: 2000 }, (_, i) => ({
        value: `Emitter ${'e'.repeat(50)} ${i}`,
        count: i,
        id: null,
        status: null,
      })),
    };
    const t = renderReferenceValues(view);
    expect(t.length).toBeLessThanOrEqual(MAX_TOOL_TEXT);
    expect(t).toContain('more values not shown');
  });
});
