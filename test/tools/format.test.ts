import { describe, expect, it } from 'vitest';
import {
  callSignal,
  deadlineHit,
  isoDateSchema,
  MAX_TOOL_TEXT,
  optionalIsoDateSchema,
  paginateText,
  presentOrUndefined,
  renderStatusAt,
  responseFormatSchema,
  truncationNotice,
} from '../../src/tools/format.js';

describe('paginateText', () => {
  it('cuts at max and says where to continue', () => {
    expect(paginateText('abcdefghij', 0, 4)).toEqual({ text: 'abcd', nextOffset: 4 });
    expect(paginateText('abcdefghij', 4, 4)).toEqual({ text: 'efgh', nextOffset: 8 });
  });

  it('returns nextOffset null once the end is reached', () => {
    expect(paginateText('abcdefghij', 8, 4)).toEqual({ text: 'ij', nextOffset: null });
    expect(paginateText('abcd', 0, 4)).toEqual({ text: 'abcd', nextOffset: null });
  });

  it('defaults max to MAX_TOOL_TEXT (40 000)', () => {
    expect(MAX_TOOL_TEXT).toBe(40_000);
    const page = paginateText('x'.repeat(MAX_TOOL_TEXT + 5), 0);
    expect(page.text).toHaveLength(MAX_TOOL_TEXT);
    expect(page.nextOffset).toBe(MAX_TOOL_TEXT);
  });

  it('never splits a surrogate pair', () => {
    expect(paginateText('ab😀cd', 0, 3)).toEqual({ text: 'ab', nextOffset: 2 });
    expect(paginateText('ab😀cd', 2, 3)).toEqual({ text: '😀c', nextOffset: 5 });
  });
});

describe('truncationNotice', () => {
  it('says how to read the rest', () => {
    expect(truncationNotice(39_900)).toBe('[Truncated — call again with "offset": 39900]');
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

describe('renderStatusAt', () => {
  it('in force until a known date: both bounds', () => {
    const s = {
      inForce: true,
      reason: 'in_force',
      from: '2016-10-01',
      until: '2027-01-01',
    } as const;
    expect(renderStatusAt(s, '2026-11-12')).toBe(
      '✅ In force on 2026-11-12 (since 2016-10-01, until 2027-01-01)',
    );
  });

  it('in force with no end date says so', () => {
    const s = { inForce: true, reason: 'in_force', from: '2016-10-01', until: null } as const;
    expect(renderStatusAt(s, '2026-11-12')).toBe(
      '✅ In force on 2026-11-12 (since 2016-10-01, no end date)',
    );
  });

  it('in force with an end Légifrance has not dated yet', () => {
    const s = { inForce: true, reason: 'in_force', from: '2016-10-01', until: null } as const;
    expect(renderStatusAt(s, '2026-11-12', { validToUndetermined: true })).toBe(
      '✅ In force on 2026-11-12 (since 2016-10-01, until a date not yet determined)',
    );
  });

  it('ended: both bounds', () => {
    const s = { inForce: false, reason: 'ended', from: '2008-05-01', until: '2026-10-01' } as const;
    expect(renderStatusAt(s, '2026-11-12')).toBe(
      '⛔ Not in force on 2026-11-12: in force 2008-05-01 → 2026-10-01',
    );
  });

  it('ended with an unknown start', () => {
    const s = { inForce: false, reason: 'ended', from: null, until: '2026-10-01' } as const;
    expect(renderStatusAt(s, '2026-11-12')).toBe('⛔ Not in force on 2026-11-12: ended 2026-10-01');
  });

  it('not yet in force', () => {
    const s = { inForce: false, reason: 'not_yet_in_force', from: '2027-01-01', until: null };
    expect(renderStatusAt({ ...s, reason: 'not_yet_in_force' }, '2026-11-12')).toBe(
      '⏳ Not yet in force on 2026-11-12: from 2027-01-01',
    );
    expect(
      renderStatusAt({ ...s, reason: 'not_yet_in_force', until: '2028-01-01' }, '2026-11-12'),
    ).toBe('⏳ Not yet in force on 2026-11-12: from 2027-01-01 until 2028-01-01');
    expect(
      renderStatusAt({ ...s, reason: 'not_yet_in_force' }, '2026-11-12', {
        validToUndetermined: true,
      }),
    ).toBe('⏳ Not yet in force on 2026-11-12: from 2027-01-01 until a date not yet determined');
  });

  it('never applied', () => {
    const s = { inForce: false, reason: 'never_applied', from: '2020-01-01', until: '2019-01-01' };
    expect(renderStatusAt({ ...s, reason: 'never_applied' }, '2026-11-12')).toBe(
      '⛔ Never applied (still-born version)',
    );
  });

  it('in force with an unknown start omits "since"', () => {
    const s = { inForce: true, reason: 'in_force', from: null, until: null } as const;
    expect(renderStatusAt(s, '2026-11-12')).toBe('✅ In force on 2026-11-12 (no end date)');
    expect(renderStatusAt({ ...s, until: '2030-01-01' }, '2026-11-12')).toBe(
      '✅ In force on 2026-11-12 (until 2030-01-01)',
    );
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
