import * as z from 'zod/v4';
import { type IsoDate, isIsoDate } from '../domain/dates.js';

/** Upper bound of a tool's text answer, in characters; longer answers continue via `offset`. */
export const MAX_TOOL_TEXT = 40_000;

/**
 * Characters a page budget keeps beyond the serialized frame of an answer (the answer with an
 * empty list or text): `retrieved`, `vigueur_version`, and wider page numbers or offsets.
 */
export const FRAME_SLACK = 200;

/**
 * A page number or count wider than any real one. A paged answer measures its frame with this in
 * every page field (`page`, `next`, the request's `page`), so the budget, and with it every page
 * split, is the same whichever page is asked.
 */
export const WIDE_PAGE = 99_999;

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

/** What `value` adds to a JSON array: its serialized length and a separating comma. */
export function jsonCost(value: unknown): number {
  return JSON.stringify(value).length + 1;
}

/**
 * The longest slice of `text` from `offset` that takes at most `room` characters once escaped in
 * a JSON string (quotes excluded), at least one character when any is left; never splits a
 * surrogate pair.
 */
export function sliceForJson(
  text: string,
  offset: number,
  room: number,
): { text: string; nextOffset: number | null } {
  // Both answers are returned from inside the loop: nothing reads `end` after it. Node 26.5
  // (V8 14.6, Maglev loop peeling with untagged phis) compiled this loop, once it had run on
  // short texts, so that reads of `end` after the loop could see a stale value: a page lost text
  // (`text.slice(offset, end)` cut short), or a whole text got a `nextOffset` at its end
  // (`end < text.length` true for `end` = the length).
  let used = 0;
  for (let end = offset; ; ) {
    if (end >= text.length) return checkedSlice(text, offset, end, null);
    const width = (text.codePointAt(end) ?? 0) > 0xffff ? 2 : 1;
    const cost = JSON.stringify(text.slice(end, end + width)).length - 2;
    if (end > offset && used + cost > room) return checkedSlice(text, offset, end, end);
    used += cost;
    end += width;
  }
}

/**
 * `text` from `offset` to `end`, with `nextOffset`. Throws when the slice is not `end - offset`
 * characters long: an engine fault then shows as an error, not as official text silently lost.
 */
function checkedSlice(
  text: string,
  offset: number,
  end: number,
  nextOffset: number | null,
): { text: string; nextOffset: number | null } {
  const out = text.substring(offset, end);
  if (out.length !== end - offset) {
    throw new Error(
      `Text slice ${offset} to ${end} came out ${out.length} characters long instead of ${end - offset}.`,
    );
  }
  return { text: out, nextOffset };
}

/** `s` cut to `max` characters, the cut shown by a trailing "…". */
export function cut(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
}

/** Room a decision page keeps for the decision's own text, however long its head is. */
export const MIN_TEXT_ROOM = 2_000;

/**
 * The head of a decision page, built by `build(level)` with its lists cut harder at each level
 * (level 0 is the fullest), until `roomLeft(head)` characters remain for the text: at least
 * `MIN_TEXT_ROOM`, or the last level.
 */
export function fitHead(
  build: (level: number) => string,
  levels: number,
  roomLeft: (head: string) => number,
): string {
  let head = build(0);
  for (let level = 1; level < levels && roomLeft(head) < MIN_TEXT_ROOM; level++) {
    head = build(level);
  }
  return head;
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
 * items only, so `page` numbers stay stable between calls. A page past the end is empty, with
 * `pastEnd` set.
 */
export function listPage<T>(
  items: readonly T[],
  page: number,
  cost: (item: T, previous: T | undefined) => number,
  limits: { maxItems: number; budget: number },
): ListPage<T> & { pastEnd: boolean } {
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
  return {
    items: pages[page - 1] ?? [],
    total: items.length,
    pageCount: pages.length,
    hasMore: page < pages.length,
    pastEnd: page > pages.length,
  };
}
