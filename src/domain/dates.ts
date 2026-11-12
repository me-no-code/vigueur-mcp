import { normalizeTypography } from './text.js';

export type IsoDate = string; // 'YYYY-MM-DD'

function isRealDate(year: number, month: number, day: number): boolean {
  // Date.UTC maps years 0-99 to 19xx, so those years fail the check (harmless for legal texts).
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

function toIso(year: number, month: number, day: number): IsoDate | null {
  if (!isRealDate(year, month, day)) return null;
  const p = (n: number, w: number) => String(n).padStart(w, '0');
  return `${p(year, 4)}-${p(month, 2)}-${p(day, 2)}`;
}

export function isIsoDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  return isRealDate(Number(m[1]), Number(m[2]), Number(m[3]));
}

const PARIS_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Paris',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** The calendar date in Paris at `at`: legal dates are French, so "today" is too. */
export function isoDateInParis(at: Date): IsoDate {
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    PARIS_DAY.formatToParts(at).find((p) => p.type === type)?.value ?? '';
  return `${part('year').padStart(4, '0')}-${part('month')}-${part('day')}`;
}

// Keys are lowercase, accent-free, without trailing dot.
const MONTHS: Readonly<Record<string, number>> = {
  janvier: 1,
  janv: 1,
  fevrier: 2,
  fevr: 2,
  mars: 3,
  avril: 4,
  avr: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  juil: 7,
  aout: 8,
  septembre: 9,
  sept: 9,
  octobre: 10,
  oct: 10,
  novembre: 11,
  nov: 11,
  decembre: 12,
  dec: 12,
};

export function parseFrenchDate(s: string): IsoDate | null {
  const t = normalizeTypography(s)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036F]/g, '');

  const numeric = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (numeric) return toIso(Number(numeric[3]), Number(numeric[2]), Number(numeric[1]));

  const text = /^(1er|\d{1,2})\s+([a-z]+)\.?\s+(\d{4})$/.exec(t);
  if (!text) return null;
  const month = MONTHS[text[2] as string];
  if (month === undefined) return null;
  const day = text[1] === '1er' ? 1 : Number(text[1]);
  return toIso(Number(text[3]), month, day);
}
