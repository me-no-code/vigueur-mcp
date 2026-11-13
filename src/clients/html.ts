// HTML text helpers shared by the PISTE clients.

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

export function decodeEntities(s: string): string {
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
// Tag patterns use `[^<>]*`: with `[^>]*`, each "<" left unclosed rescans to the end of the text,
// which made a malformed body cost quadratic time.
export function htmlToText(html: string): string {
  const withBreaks = html
    // `</br>` is noise.
    .replace(/<\/br\s*>/gi, '')
    // A run of empty paragraphs holding a line break is one blank line.
    .replace(/(?:<p\b[^<>]*>\s*(?:<br\b[^<>]*>\s*)+<\/p>\s*)+/gi, '\n\n')
    // A paragraph wrapping a cell's or an item's content is not a line of its own.
    .replace(/(<t[dh]\b[^<>]*>)\s*<p\b[^<>]*>/gi, '$1')
    .replace(/<\/p>\s*(<\/t[dh]>)/gi, '$1')
    // A cell followed by another on its row ends with " | "; the row's end is a line break.
    .replace(/<\/t[dh]>\s*(?=<t[dh]\b)/gi, ' | ')
    .replace(/<li\b[^<>]*>(?:\s*<p\b[^<>]*>)*\s*/gi, '<li>- ')
    // Runs of block tags (and the spaces between them) are a single line break.
    .replace(
      /(?:<\/?(?:p|br|div|li|ul|ol|tr|table|thead|tbody|tfoot|h[1-6])\b[^<>]*>[ \t]*)+/gi,
      '\n',
    );
  const noTags = withBreaks.replace(/<[^<>]*>/g, '');
  return decodeEntities(noTags)
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
