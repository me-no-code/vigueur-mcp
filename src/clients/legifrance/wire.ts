import { type IsoDate, isIsoDate } from '../../domain/dates.js';

export { cleanTitle, htmlToText } from '../html.js';

export type DateSentinel = 'none' | 'open_ended' | 'undetermined';

const OPEN_ENDED = '2999-01-01';
const UNDETERMINED = '2222-02-22';

function toDatePart(v: unknown): string | null {
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return null;
    try {
      return new Date(v).toISOString().slice(0, 10);
    } catch {
      return null;
    }
  }
  if (typeof v === 'string') {
    const m = /^(\d{4}-\d{2}-\d{2})(?:T.*)?$/.exec(v.trim());
    return m ? (m[1] as string) : null;
  }
  return null;
}

/** Parses a Légifrance response date (epoch ms, ISO with/without time); sentinels never become dates. */
export function parseApiDate(v: unknown): { date: IsoDate | null; sentinel: DateSentinel } {
  const part = toDatePart(v);
  if (part === null || !isIsoDate(part)) return { date: null, sentinel: 'none' };
  if (part === OPEN_ENDED) return { date: null, sentinel: 'open_ended' };
  if (part === UNDETERMINED) return { date: null, sentinel: 'undetermined' };
  return { date: part, sentinel: 'none' };
}

/** Drops the `_dd-mm-yyyy` version suffix from an id. */
export function stripIdSuffix(id: string): string {
  return id.replace(/_\d{2}-\d{2}-\d{4}$/, '');
}

/** Removes search highlight tags. */
export function stripMarks(s: string): string {
  return s.replace(/<\/?mark>/gi, '');
}
