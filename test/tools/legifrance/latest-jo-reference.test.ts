import { afterEach, describe, expect, it } from 'vitest';
import { compose } from '../../../src/compose.js';
import type { LatestJoView, ReferenceView } from '../../../src/services/legislation/jo.js';
import type { JoIssue, JoText } from '../../../src/services/legislation/ports.js';
import { MAX_TOOL_TEXT } from '../../../src/tools/format.js';
import { renderLatestJo } from '../../../src/tools/legifrance/latest-jo.js';
import { renderReferenceValues } from '../../../src/tools/legifrance/reference-values.js';
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
