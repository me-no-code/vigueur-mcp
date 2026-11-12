import { type IsoDate, isIsoDate } from '../../domain/dates.js';

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

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === '#') {
      const code =
        body[1] === 'x' || body[1] === 'X'
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10);
      if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) return whole;
      return String.fromCodePoint(code);
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named ?? whole;
  });
}

/** Decodes entities, collapses whitespace runs to one space, trims. */
export function cleanTitle(s: string): string {
  return decodeEntities(s).replace(/\s+/g, ' ').trim();
}

/**
 * Small HTML to plain-text converter: block tags become line breaks, other tags are dropped. The
 * text itself is kept verbatim; only whitespace and these separators are added:
 * - the cells of a table row are joined by " | ", and each row is a line;
 * - each list item is a line of its own, prefixed "- ";
 * - a run of empty paragraphs holding a line break (`<p><br></p>`) is one blank line.
 */
export function htmlToText(html: string): string {
  const withBreaks = html
    // `</br>` is noise.
    .replace(/<\/br\s*>/gi, '')
    // A run of empty paragraphs holding a line break is one blank line.
    .replace(/(?:<p\b[^>]*>\s*(?:<br\b[^>]*>\s*)+<\/p>\s*)+/gi, '\n\n')
    // A paragraph wrapping a cell's or an item's content is not a line of its own.
    .replace(/(<t[dh]\b[^>]*>)\s*<p\b[^>]*>/gi, '$1')
    .replace(/<\/p>\s*(<\/t[dh]>)/gi, '$1')
    // A cell followed by another on its row ends with " | "; the row's end is a line break.
    .replace(/<\/t[dh]>\s*(?=<t[dh]\b)/gi, ' | ')
    .replace(/<li\b[^>]*>(?:\s*<p\b[^>]*>)*\s*/gi, '<li>- ')
    // Runs of block tags (and the spaces between them) are a single line break.
    .replace(
      /(?:<\/?(?:p|br|div|li|ul|ol|tr|table|thead|tbody|tfoot|h[1-6])\b[^>]*>[ \t]*)+/gi,
      '\n',
    );
  const noTags = withBreaks.replace(/<[^>]*>/g, '');
  return decodeEntities(noTags)
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
