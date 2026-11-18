import { describe, expect, it } from 'vitest';
import {
  callSignal,
  cut,
  deadlineHit,
  FRAME_SLACK,
  fitting,
  isoDateSchema,
  listPage,
  MAX_TOOL_TEXT,
  optionalIsoDateSchema,
  presentOrUndefined,
  responseFormatSchema,
  roomAfter,
  sliceForJson,
} from '../../src/tools/format.js';

// First in this file: the engine fault below shows only while `sliceForJson` has been compiled
// on short texts and not yet on long ones.
describe('sliceForJson on a long text that fits, after short texts', () => {
  it('gives the whole text and no next offset, on every call', () => {
    // Node 26.5 (V8 Maglev) answered `nextOffset` = the text length here: the loop counter read
    // after the loop was stale in `end < text.length` and current in `end`.
    for (let i = 0; i < 10; i++) sliceForJson('Texte officiel.', 0, 39_000);
    const text = 'Alinéa : texte "officiel" de l\'article.\n'.repeat(800);
    expect(text.length).toBeGreaterThan(30_000);
    for (let i = 0; i < 6; i++) {
      const s = sliceForJson(text, 0, 39_000);
      expect(s.nextOffset, `call ${i + 1}`).toBeNull();
      expect(s.text === text, `call ${i + 1}: the whole text`).toBe(true);
    }
  });
});

describe('sliceForJson length check', () => {
  it('a normal slice has the length it measured', () => {
    expect(sliceForJson('abcdef', 0, 3)).toEqual({ text: 'abc', nextOffset: 3 });
    expect(sliceForJson('abcdef', 3, 100)).toEqual({ text: 'def', nextOffset: null });
  });

  it('throws when the slice taken is shorter than measured, instead of losing text', () => {
    // The engine fault that once cut pages short (Node 26.5, V8 Maglev) cannot be triggered on
    // demand: it depends on when V8 compiles the function. A string whose `substring` drops its
    // first character stands in for it, on both ways out of the loop (cut, and end of text).
    const real = 'abcdef';
    const lossy = {
      length: real.length,
      codePointAt: (i: number) => real.codePointAt(i),
      slice: (start: number, end?: number) => real.slice(start, end),
      substring: (start: number, end?: number) => real.substring(start, end).substring(1),
    } as unknown as string;
    expect(() => sliceForJson(lossy, 0, 3)).toThrow(
      'Text slice 0 to 3 came out 2 characters long instead of 3.',
    );
    expect(() => sliceForJson(lossy, 2, 100)).toThrow(
      'Text slice 2 to 6 came out 3 characters long instead of 4.',
    );
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

describe('roomAfter', () => {
  it('leaves the cap minus the frame and the slack', () => {
    expect(roomAfter('{"a":1}')).toBe(MAX_TOOL_TEXT - 7 - FRAME_SLACK);
  });
});

describe('fitting', () => {
  const len = (s: string) => s.length;

  it('keeps every item when their total equals the room', () => {
    expect(fitting(['aaa', 'bbb'], 6, len)).toEqual(['aaa', 'bbb']);
  });

  it('stops before the item that would pass the room', () => {
    expect(fitting(['aaa', 'bbb'], 5, len)).toEqual(['aaa']);
  });

  it('always keeps the first item, however large', () => {
    expect(fitting(['aaaaaa', 'b'], 1, len)).toEqual(['aaaaaa']);
  });

  it('an empty list gives an empty list', () => {
    expect(fitting([], 10, len)).toEqual([]);
  });

  it('measures items by what they add to a JSON array by default', () => {
    // {"a":1} is 7 characters, plus its comma: 8 each.
    expect(fitting([{ a: 1 }, { a: 2 }], 16)).toEqual([{ a: 1 }, { a: 2 }]);
    expect(fitting([{ a: 1 }, { a: 2 }], 15)).toEqual([{ a: 1 }]);
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
