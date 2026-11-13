import { type IsoDate, isIsoDate } from '../../domain/dates.js';
import type { CaseLawCollection } from '../../domain/decisions.js';

// The five case-law fonds describe a decision only through its title: a search hit
// carries no court, date or number of its own. Each fond has its own title grammar.

export interface ParsedCaseLawTitle {
  court: string;
  chamber: string | null;
  nature: string | null;
  date: IsoDate;
  numbers: string[];
  publication: string | null;
}

const MONTHS: Readonly<Record<string, number>> = {
  janvier: 1,
  février: 2,
  mars: 3,
  avril: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  août: 8,
  septembre: 9,
  octobre: 10,
  novembre: 11,
  décembre: 12,
};
const MONTH_NAMES = Object.keys(MONTHS).join('|');
const WORDED_DATE = `(\\d{1,2})(?:er)?\\s+(${MONTH_NAMES})\\s+(\\d{4})`;
const WORDED_DATE_AT_END = new RegExp(`^(.*?)\\s*${WORDED_DATE}$`, 'i');
const SLASH_DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/;

const CNIL_COURT = "Commission nationale de l'informatique et des libertés";

function isoDate(year: string, month: number, day: string): IsoDate | null {
  const iso = `${year}-${String(month).padStart(2, '0')}-${day.padStart(2, '0')}`;
  return isIsoDate(iso) ? iso : null;
}

function wordedDate(day: string, month: string, year: string): IsoDate | null {
  const m = MONTHS[month.toLowerCase()];
  return m === undefined ? null : isoDate(year, m, day);
}

const words = (s: string) => s.split(' ').filter((w) => w !== '');
const orNull = (s: string | undefined) => (s === undefined || s === '' ? null : s);

/** `Court, [formation,] [chamber,] 17 septembre 2026, numbers[, publication]`. */
function parseJudicial(title: string): ParsedCaseLawTitle | null {
  const parts = title.split(', ');
  const at = parts.findIndex((p, i) => i > 0 && WORDED_DATE_AT_END.test(p));
  if (at < 1) return null;
  const m = WORDED_DATE_AT_END.exec(parts[at] as string);
  if (m === null) return null;
  const date = wordedDate(m[2] as string, m[3] as string, m[4] as string);
  if (date === null) return null;
  // "Cour de cassation, civile, Chambre civile 2": the last segment names the chamber. An
  // appeal court sometimes glues it to the date ("CHAMBRE 7 SECTION 27 avril 2011").
  const between = parts.slice(1, at);
  const chamber = orNull(m[1]) ?? orNull(between[between.length - 1]);
  const rest = parts.slice(at + 1);
  return {
    court: parts[0] as string,
    chamber,
    nature: null,
    date,
    numbers: words(rest[0] ?? ''),
    publication: orNull(rest.slice(1).join(', ')),
  };
}

/** `Court, [chamber,] 06/10/2026, number[, publication]`. */
function parseAdministrative(title: string): ParsedCaseLawTitle | null {
  const parts = title.split(', ');
  const at = parts.findIndex((p, i) => i > 0 && SLASH_DATE.test(p));
  if (at < 1) return null;
  const m = SLASH_DATE.exec(parts[at] as string);
  if (m === null) return null;
  const date = isoDate(m[3] as string, Number(m[2]), m[1] as string);
  if (date === null) return null;
  const rest = parts.slice(at + 1);
  return {
    court: parts[0] as string,
    chamber: orNull(parts.slice(1, at).join(', ')),
    nature: null,
    date,
    numbers: words(rest[0] ?? ''),
    publication: orNull(rest.slice(1).join(', ')),
  };
}

const CONSTITUTIONAL = new RegExp(
  `^Décision\\s+(\\S+)(?:\\s+(\\S+))?\\s+-\\s+${WORDED_DATE}\\s+-\\s`,
  'i',
);

/** `Décision 2026-1217/1218 QPC - 06 août 2026 - parties [object] - outcome`. */
function parseConstitutional(title: string): ParsedCaseLawTitle | null {
  const m = CONSTITUTIONAL.exec(title);
  if (m === null) return null;
  const date = wordedDate(m[3] as string, m[4] as string, m[5] as string);
  if (date === null) return null;
  return {
    court: 'Conseil constitutionnel',
    chamber: null,
    nature: orNull(m[2]),
    date,
    numbers: [m[1] as string],
    publication: null,
  };
}

const CNIL = new RegExp(
  `^(Délibération|Décision)\\s+(?:(?:de la|de l'|du|des)\\s*(.+?)\\s+)?(?:n\\s*°\\s*)?(\\S+)\\s+du\\s+${WORDED_DATE}(?:\\s|$)`,
  'i',
);

/** `Délibération [de la formation restreinte] n° SAN-2026-015 du 22 octobre 2026 object`. */
function parseCnil(title: string): ParsedCaseLawTitle | null {
  const m = CNIL.exec(title);
  if (m === null) return null;
  const date = wordedDate(m[4] as string, m[5] as string, m[6] as string);
  if (date === null) return null;
  return {
    court: CNIL_COURT,
    chamber: orNull(m[2]),
    nature: m[1] as string,
    date,
    numbers: [m[3] as string],
    publication: null,
  };
}

/** `COURT - [CHAMBER - ]Nature - 22/10/2026 - party - Affaire n° 127 - n° S-2026-1144`. */
function parseFinancial(title: string): ParsedCaseLawTitle | null {
  const parts = title.split(' - ');
  const at = parts.findIndex((p, i) => i > 0 && SLASH_DATE.test(p));
  if (at < 2 || at > 3) return null;
  const m = SLASH_DATE.exec(parts[at] as string);
  if (m === null) return null;
  const date = isoDate(m[3] as string, Number(m[2]), m[1] as string);
  if (date === null) return null;
  const number = /^n\s*°\s*(\S.*)$/i.exec(parts[parts.length - 1] as string);
  return {
    court: parts[0] as string,
    chamber: at === 3 ? (parts[1] as string) : null,
    nature: parts[at - 1] as string,
    date,
    numbers: number === null ? [] : [number[1] as string],
    publication: null,
  };
}

const PARSERS: Readonly<Record<CaseLawCollection, (title: string) => ParsedCaseLawTitle | null>> = {
  judicial: parseJudicial,
  administrative: parseAdministrative,
  constitutional: parseConstitutional,
  cnil: parseCnil,
  financial: parseFinancial,
};

/** The facts a Légifrance case-law title states; null when the title does not follow its fond's grammar. */
export function parseCaseLawTitle(
  collection: CaseLawCollection,
  title: string,
): ParsedCaseLawTitle | null {
  return PARSERS[collection](title.replace(/\s+/g, ' ').trim());
}
