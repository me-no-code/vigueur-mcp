import { normalizeTypography } from './text.js';

const SUFFIXES = 'bis|ter|quater|quinquies|sexies|septies|octies|nonies|decies';

/** Spaces around hyphens removed; "6bis" / "6 bis" → "6 bis". */
function normalizeNumberPart(rest: string): string {
  const compact = rest.trim().replace(/\s*-\s*/g, '-');
  const m = new RegExp(`^(\\d+(?:-\\d+)*)\\s*(${SUFFIXES})$`, 'i').exec(compact);
  if (m) return `${m[1]} ${(m[2] as string).toLowerCase()}`;
  return compact;
}

export function normalizeArticleNumber(raw: string): string {
  // Légifrance numbers article premier "1", in codes, laws and the Journal officiel alike.
  const s = normalizeTypography(raw)
    .trim()
    .replace(/^(?:premier|1er)(?=\s|$)/i, '1');

  // Prefix: LO / L.O. / L / R / D / A, optionally dotted, followed by a digit.
  const prefixed = /^(l\.?\s?o|[lrda])\s*\.?\s*(\d.*)$/i.exec(s);
  if (prefixed) {
    const prefix = (prefixed[1] as string).replace(/[.\s]/g, '').toUpperCase();
    return prefix + normalizeNumberPart(prefixed[2] as string);
  }
  return normalizeNumberPart(s);
}
