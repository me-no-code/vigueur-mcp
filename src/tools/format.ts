import * as z from 'zod/v4';
import { type IsoDate, isIsoDate } from '../domain/dates.js';
import type { StatusAt } from '../domain/status-at.js';

/** Upper bound of a tool's text answer, in characters; longer answers continue via `offset`. */
export const MAX_TOOL_TEXT = 40_000;

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

/** One line saying whether a version applies on `asOf`, from its validity dates. */
export function renderStatusAt(s: StatusAt, asOf: IsoDate): string {
  switch (s.reason) {
    case 'in_force':
      return s.from === null
        ? `✅ In force on ${asOf}`
        : `✅ In force on ${asOf} (since ${s.from})`;
    case 'ended':
      return `⛔ Not in force on ${asOf}: ended ${s.until ?? 'on an unknown date'}`;
    case 'not_yet_in_force':
      return `⏳ Not yet in force on ${asOf}: from ${s.from ?? 'an unknown date'}`;
    case 'never_applied':
      return '⛔ Never applied (still-born version)';
  }
}
