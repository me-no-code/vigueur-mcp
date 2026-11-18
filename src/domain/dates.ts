export type IsoDate = string; // 'YYYY-MM-DD'

function isRealDate(year: number, month: number, day: number): boolean {
  // Date.UTC maps years 0-99 to 19xx, so those years fail the check (harmless for legal texts).
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
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

/** The calendar date `days` days before `date` (calendar arithmetic, no time zone involved). */
export function minusDays(date: IsoDate, days: number): IsoDate {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, (d ?? 1) - days));
  const p = (n: number, w: number) => String(n).padStart(w, '0');
  return `${p(t.getUTCFullYear(), 4)}-${p(t.getUTCMonth() + 1, 2)}-${p(t.getUTCDate(), 2)}`;
}
