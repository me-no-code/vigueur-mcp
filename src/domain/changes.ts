import { normalizeTypography } from './text.js';

/**
 * Whether two texts have the same wording: identical once typography alone is set aside (quote
 * and dash styles, kinds of space, runs of spaces). A change of case, accent or punctuation is a
 * different wording.
 */
export function sameWording(a: string, b: string): boolean {
  return normalizeTypography(a).trim() === normalizeTypography(b).trim();
}
