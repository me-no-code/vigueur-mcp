import { normalizeTypography } from './text.js';

export type ChangeKind = 'unchanged' | 'amended' | 'replaced';

function words(s: string): string[] {
  return normalizeTypography(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036F]/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 0);
}

function dice(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  let shared = 0;
  for (const x of a) if (b.has(x)) shared++;
  return (2 * shared) / (a.size + b.size);
}

/** Dice coefficient over word-pair sets (word sets when a side has < 2 words); 0..1. */
export function textSimilarity(a: string, b: string): number {
  const wa = words(a);
  const wb = words(b);
  if (wa.length === 0 || wb.length === 0) return 0;
  if (wa.join(' ') === wb.join(' ')) return 1;
  if (wa.length < 2 || wb.length < 2) return dice(new Set(wa), new Set(wb));
  const pairs = (w: string[]) => new Set(w.slice(1).map((x, i) => `${w[i]} ${x}`));
  return dice(pairs(wa), pairs(wb));
}

export function classifyChange(before: string, after: string): ChangeKind {
  const wa = words(before).join(' ');
  const wb = words(after).join(' ');
  if (wa === wb) return 'unchanged';
  if (wa === '' || wb === '') return 'replaced';
  return textSimilarity(before, after) >= 0.4 ? 'amended' : 'replaced';
}

function cleanWords(s: string): string[] {
  return s
    .split(/\s+/)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter((w) => w.length > 0);
}

/** A short verbatim phrase from the text, suitable for a full-text search. */
export function searchPhrase(text: string, maxWords = 8): string {
  const normalized = normalizeTypography(text);
  for (const clause of normalized.split(/[,;:.!?()]/)) {
    const w = cleanWords(clause);
    if (w.length >= 4) return w.slice(0, maxWords).join(' ');
  }
  return cleanWords(normalized).slice(0, maxWords).join(' ');
}
