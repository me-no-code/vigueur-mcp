import { foldKey, normalizeTypography } from '../../domain/text.js';

export type TextNature = 'loi' | 'loi_organique' | 'ordonnance' | 'decret' | 'arrete';

/** A text as a person names it: a Légifrance id, a NOR, or a nature and a number. */
export type TextRef = { id: string } | { nor: string } | { nature: TextNature; number: string };

/** Natures by their folded spelling: accents, case, spaces and `_` do not matter. */
const NATURES: ReadonlyMap<string, TextNature> = new Map([
  ['loi', 'loi'],
  ['loiorganique', 'loi_organique'],
  ['ordonnance', 'ordonnance'],
  ['decret', 'decret'],
  ['arrete', 'arrete'],
]);

const TEXT_ID = /^(?:LEGITEXT|JORFTEXT)\d{12}$/i;
const NOR = /^[A-Z]{4}\d{7}[A-Z]$/i;
/** "n°", "no", "No.", "nº" (read as "n°") before a number, with or without spaces. */
const PREFIX = String.raw`n\s*(?:°|o\.?)\s*`;
const NUMBER_PREFIX = new RegExp(`^${PREFIX}`, 'i');
/** The nature is everything before the number (or its "n°"); the number runs to the end. */
const NATURE_NUMBER = new RegExp(String.raw`^(\D+?)\s+((?:${PREFIX})?\d[\d\s-]*)$`, 'i');

/** NFC first, so that a decomposed accent (NFD) is one character like a typed one. */
const tidy = (raw: string) => normalizeTypography(raw.normalize('NFC')).trim();

/**
 * A text number as typed, as Légifrance files it: without a leading "n°" / "no" / "nº", without
 * spaces around its hyphens, typographic dashes read as "-" ("n° 78 – 17" → "78-17"). Anything
 * else is kept as typed.
 */
export function normaliseTextNumber(raw: string): string {
  return tidy(raw)
    .replace(NUMBER_PREFIX, '')
    .replace(/\s*-\s*/g, '-')
    .trim();
}

/**
 * Reads "loi 78-17", "Décret n° 2019-1088", "loi organique 2001-692", a LEGITEXT / JORFTEXT id
 * or a NOR (ids and NORs uppercased). The nature is matched folded (accents, case, extra spaces
 * and `_` ignored, decomposed accents included); the number goes through `normaliseTextNumber`.
 * `null` when the text is none of these.
 */
export function parseTextRef(raw: string): TextRef | null {
  const s = tidy(raw);
  if (TEXT_ID.test(s)) return { id: s.toUpperCase() };
  if (NOR.test(s)) return { nor: s.toUpperCase() };
  const m = NATURE_NUMBER.exec(s);
  if (m === null) return null;
  const nature = NATURES.get(foldKey(m[1] as string));
  const number = normaliseTextNumber(m[2] as string);
  if (nature === undefined || !/^\d[\d-]*$/.test(number)) return null;
  return { nature, number };
}
