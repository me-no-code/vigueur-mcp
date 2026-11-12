/**
 * Step 1 of normalizeTypography: single-character replacements only, so the
 * result has exactly the same length as the input (indices stay valid for
 * mapping back to the original text).
 */
export function replaceTypographyChars(s: string): string {
  // Each class holds single UTF-16 code units only, so every replacement is one-for-one.
  // Known miss: U+00AD (soft hyphen) is invisible and would have to be removed, which would
  // change the length; it is left as is.
  return s
    .replace(/[\u00A0\u2007\u2009\u200A\u202F]/g, ' ') // NBSP, figure, thin, hair, narrow NBSP
    .replace(/[\u2018\u2019\u02BC]/g, "'") // curly quotes, modifier-letter apostrophe
    .replace(/[\u2010-\u2014\u2212]/g, '-') // hyphen, NB hyphen, figure/en/em dash, minus
    .replace(/\u00BA/g, '\u00B0'); // masculine ordinal indicator -> degree sign ("nº" -> "n°")
}

/**
 * Step 2 of normalizeTypography: collapse runs of spaces. This is the only
 * step that can shorten the string.
 */
export function collapseSpaces(s: string): string {
  return s.replace(/ {2,}/g, ' ');
}

export function normalizeTypography(s: string): string {
  return collapseSpaces(replaceTypographyChars(s));
}

/** Lowercase, strip accents, keep only [a-z0-9]. Used for lenient lookups. */
export function foldKey(s: string): string {
  return normalizeTypography(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036F]/g, '')
    .replace(/[^a-z0-9]/g, '');
}
