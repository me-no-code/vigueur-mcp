import { type IsoDate, isIsoDate, isoDateInParis } from '../domain/dates.js';
import { VigueurError } from '../shared/errors.js';

// Input helpers shared by every service.

export const invalid = (message: string) => new VigueurError('invalid_input', message);

/** Trimmed string, or `null` when absent or blank. */
export function blankToNull(s: string | undefined): string | null {
  const t = s?.trim();
  return t === undefined || t === '' ? null : t;
}

export const todayInParis = (): IsoDate => isoDateInParis(new Date());

/** Throws `invalid_input` unless `value` is a real `YYYY-MM-DD` date. */
export function requireIsoDate(value: string, label?: string): IsoDate {
  if (!isIsoDate(value)) {
    throw invalid(
      `${label ? `${label}: ` : ''}"${value}" is not a valid date: use a real date as YYYY-MM-DD.`,
    );
  }
  return value;
}
