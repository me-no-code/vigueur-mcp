import * as z from 'zod/v4';
import { type IsoDate, isIsoDate } from '../domain/dates.js';
import type { StatusAt } from '../domain/status-at.js';
import { VigueurError } from '../shared/errors.js';

/** Upper bound of a tool's text answer, in characters; longer answers continue via `offset`. */
export const MAX_TOOL_TEXT = 40_000;

/** How long a tool call may take before it gives up, in milliseconds. */
export const DEFAULT_DEADLINE_MS = 45_000;

const deadlineSignals = new WeakMap<AbortSignal, AbortSignal>();

/**
 * The signal a tool call hands to its service: aborts when the MCP client cancels or after `ms`
 * (the deadline). Use `deadlineHit` to tell the two apart.
 */
export function callSignal(
  mcpSignal: AbortSignal | undefined,
  ms: number = DEFAULT_DEADLINE_MS,
): AbortSignal {
  const timeout = AbortSignal.timeout(ms);
  const signal = mcpSignal === undefined ? timeout : AbortSignal.any([mcpSignal, timeout]);
  deadlineSignals.set(signal, timeout);
  return signal;
}

/** True when `signal` (from `callSignal`) aborted because the deadline passed, not a cancel. */
export function deadlineHit(signal: AbortSignal): boolean {
  const timeout = deadlineSignals.get(signal);
  return signal.aborted && timeout?.aborted === true && signal.reason === timeout.reason;
}

const DATE_MESSAGE = 'Use a real date as YYYY-MM-DD';

export const isoDateSchema: z.ZodType<IsoDate> = z
  .string()
  .refine(isIsoDate, { message: DATE_MESSAGE });

/** An optional date input; a blank string is accepted and counts as absent (see `presentOrUndefined`). */
export const optionalIsoDateSchema = z
  .string()
  .refine((s) => s.trim() === '' || isIsoDate(s), { message: DATE_MESSAGE })
  .optional();

export const responseFormatSchema: z.ZodType<'concise' | 'detailed'> = z.enum([
  'concise',
  'detailed',
]);

/** Trimmed input, or `undefined` when absent or blank: clients often send `""` for unset fields. */
export function presentOrUndefined(s: string | undefined): string | undefined {
  const t = s?.trim();
  return t === undefined || t === '' ? undefined : t;
}

const isHighSurrogate = (code: number) => code >= 0xd800 && code <= 0xdbff;

/** The slice of `text` starting at `offset`, at most `max` characters; never splits a surrogate pair. */
export function paginateText(
  text: string,
  offset: number,
  max: number = MAX_TOOL_TEXT,
): { text: string; nextOffset: number | null } {
  let end = Math.min(offset + max, text.length);
  if (end < text.length && end - 1 > offset && isHighSurrogate(text.charCodeAt(end - 1))) end -= 1;
  return { text: text.slice(offset, end), nextOffset: end < text.length ? end : null };
}

/** Appended where a paginated text stops: how to read the rest. */
export function truncationNotice(nextOffset: number): string {
  return `[Truncated — call again with "offset": ${nextOffset}]`;
}

/** How a version's end reads: `until {date}`, a scheduled end with no date yet, or `null` (none). */
export function untilPhrase(validTo: IsoDate | null, validToUndetermined = false): string | null {
  if (validTo !== null) return `until ${validTo}`;
  return validToUndetermined ? 'until a date not yet determined' : null;
}

/** The end of a version in a table cell or a period line. */
export function endCell(
  v: { validTo: IsoDate | null; validToUndetermined?: boolean },
  undetermined = 'not yet determined',
): string {
  return v.validTo ?? (v.validToUndetermined === true ? undetermined : 'no end');
}

/**
 * One line saying whether a version applies on `asOf`, from its validity dates, with both
 * bounds: a scheduled end is never hidden behind "in force".
 */
export function renderStatusAt(
  s: StatusAt,
  asOf: IsoDate,
  opts: { validToUndetermined?: boolean } = {},
): string {
  const until = untilPhrase(s.until, opts.validToUndetermined);
  switch (s.reason) {
    case 'in_force': {
      const bounds = [...(s.from === null ? [] : [`since ${s.from}`]), until ?? 'no end date'];
      return `✅ In force on ${asOf} (${bounds.join(', ')})`;
    }
    case 'ended':
      return s.from === null
        ? `⛔ Not in force on ${asOf}: ended ${s.until ?? 'on an unknown date'}`
        : `⛔ Not in force on ${asOf}: in force ${s.from} → ${s.until ?? 'an unknown date'}`;
    case 'not_yet_in_force':
      return `⏳ Not yet in force on ${asOf}: from ${s.from ?? 'an unknown date'}${until === null ? '' : ` ${until}`}`;
    case 'never_applied':
      return '⛔ Never applied (still-born version)';
  }
}

/** One page of a list, cut by item count and by the characters its lines take. */
export interface ListPage<T> {
  items: T[];
  /** Items over all pages. */
  total: number;
  pageCount: number;
  hasMore: boolean;
}

/**
 * Page `page` (1-based) of `items`: pages hold at most `maxItems` items and about `budget`
 * characters, at least one item. `cost(item, previous)` is what `item` adds to its page after
 * `previous`, the item before it on the same page: `undefined` when the item opens a page, so
 * what every page start repeats (a heading, say) is charged there only. The split depends on the
 * items only, so `page` numbers stay stable between calls. A page past the end is an
 * `invalid_input` error.
 */
export function pageByBudget<T>(
  items: readonly T[],
  page: number,
  cost: (item: T, previous: T | undefined) => number,
  limits: { maxItems: number; budget: number },
): ListPage<T> {
  const pages: T[][] = [];
  let current: T[] = [];
  let used = 0;
  for (const item of items) {
    let c = cost(item, current.at(-1));
    if (current.length > 0 && (current.length >= limits.maxItems || used + c > limits.budget)) {
      pages.push(current);
      current = [];
      used = 0;
      c = cost(item, undefined);
    }
    current.push(item);
    used += c;
  }
  if (current.length > 0 || pages.length === 0) pages.push(current);
  if (page > pages.length) {
    throw new VigueurError(
      'invalid_input',
      `"page" ${page} is past the last page (${pages.length}). Use a page from 1 to ${pages.length}.`,
    );
  }
  return {
    items: pages[page - 1] ?? [],
    total: items.length,
    pageCount: pages.length,
    hasMore: page < pages.length,
  };
}

/** Hint appended where a paged list continues. */
export function nextPageHint(page: number): string {
  return `Next page: "page": ${page + 1}`;
}
