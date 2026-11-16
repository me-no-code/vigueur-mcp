import { describe, expect, it } from 'vitest';
import {
  callSignal,
  cut,
  deadlineHit,
  isoDateSchema,
  listPage,
  MAX_TOOL_TEXT,
  optionalIsoDateSchema,
  presentOrUndefined,
  responseFormatSchema,
} from '../../src/tools/format.js';

describe('MAX_TOOL_TEXT', () => {
  it('is 40 000 characters', () => {
    expect(MAX_TOOL_TEXT).toBe(40_000);
  });
});

describe('isoDateSchema', () => {
  it.each(['2015-13-01', '12/03/2024', '2023-02-29', ''])('rejects %j', (value) => {
    const parsed = isoDateSchema.safeParse(value);
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe('Use a real date as YYYY-MM-DD');
  });

  it('accepts a real YYYY-MM-DD date', () => {
    expect(isoDateSchema.parse('2024-02-29')).toBe('2024-02-29');
  });
});

describe('optionalIsoDateSchema', () => {
  it('accepts absent and blank values (blank counts as absent)', () => {
    expect(optionalIsoDateSchema.safeParse(undefined).success).toBe(true);
    expect(optionalIsoDateSchema.safeParse('').success).toBe(true);
    expect(optionalIsoDateSchema.safeParse('2015-01-01').success).toBe(true);
  });

  it('rejects a malformed date', () => {
    expect(optionalIsoDateSchema.safeParse('2015-13-01').success).toBe(false);
  });
});

describe('presentOrUndefined', () => {
  it('trims and maps blank or absent strings to undefined', () => {
    expect(presentOrUndefined(undefined)).toBeUndefined();
    expect(presentOrUndefined('')).toBeUndefined();
    expect(presentOrUndefined('   ')).toBeUndefined();
    expect(presentOrUndefined(' Code civil ')).toBe('Code civil');
  });
});

describe('responseFormatSchema', () => {
  it('accepts concise and detailed only', () => {
    expect(responseFormatSchema.parse('concise')).toBe('concise');
    expect(responseFormatSchema.parse('detailed')).toBe('detailed');
    expect(responseFormatSchema.safeParse('verbose').success).toBe(false);
  });
});

describe('callSignal', () => {
  it('aborts after the deadline with a TimeoutError reason', async () => {
    const signal = callSignal(undefined, 20);
    expect(signal.aborted).toBe(false);
    await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }));
    expect(signal.reason).toMatchObject({ name: 'TimeoutError' });
    expect(deadlineHit(signal)).toBe(true);
  });

  it('follows the MCP signal and is not a deadline hit then', () => {
    const mcp = new AbortController();
    const signal = callSignal(mcp.signal, 60_000);
    mcp.abort();
    expect(signal.aborted).toBe(true);
    expect(deadlineHit(signal)).toBe(false);
  });
});

describe('listPage', () => {
  it('cuts by budget and item count, at least one item a page, stable page numbers', () => {
    const items = ['aaaa', 'bbbb', 'cccc', 'dddddddddddd', 'e'];
    const page = (n: number) =>
      listPage(items, n, (s) => s.length, { maxItems: 2, budget: 8 }).items;
    expect([page(1), page(2), page(3), page(4)]).toEqual([
      ['aaaa', 'bbbb'],
      ['cccc'],
      ['dddddddddddd'],
      ['e'],
    ]);
    const past = listPage(items, 5, (s) => s.length, { maxItems: 2, budget: 8 });
    expect(past).toMatchObject({ items: [], pastEnd: true, pageCount: 4, total: 5 });
  });

  it('costs an item with the item before it on the page, and again when it opens a page', () => {
    const seen: Array<[string, string | undefined]> = [];
    // An item costs 10 when it opens a page (a repeated header), 3 after another item.
    const paged = listPage(
      ['a', 'b', 'c', 'd'],
      2,
      (item, previous) => {
        seen.push([item, previous]);
        return previous === undefined ? 10 : 3;
      },
      { maxItems: 10, budget: 15 },
    );
    expect(paged.items).toEqual(['c', 'd']);
    expect(paged.pageCount).toBe(2);
    expect(seen).toEqual([
      ['a', undefined],
      ['b', 'a'],
      ['c', 'b'],
      ['c', undefined],
      ['d', 'c'],
    ]);
  });
});

describe('cut', () => {
  it('keeps a short text as is and marks a cut with "…" within the limit', () => {
    expect(cut('abc', 3)).toBe('abc');
    expect(cut('abcdef', 4)).toBe('abc…');
    expect(cut('abc def', 4)).toBe('abc…');
    expect(cut('abcdef', 4)).toHaveLength(4);
  });
});
