import type { CassChamber } from './citations.js';
import type { IsoDate } from './dates.js';

export type CaseLawCollection =
  | 'judicial'
  | 'administrative'
  | 'constitutional'
  | 'cnil'
  | 'financial';

export const CASS_CHAMBER_LABELS: Readonly<Record<CassChamber, string>> = {
  plenary: 'Assemblée plénière',
  mixed: 'Chambre mixte',
  civ1: 'Première chambre civile',
  civ2: 'Deuxième chambre civile',
  civ3: 'Troisième chambre civile',
  commercial: 'Chambre commerciale, financière et économique',
  social: 'Chambre sociale',
  criminal: 'Chambre criminelle',
};

const POURVOI_PREFIX = /^\s*(?:pourvoi\s+)?(?:n\s*[°o]\s*)?(?:[A-Za-z]\s*)?/i;
const POURVOI_BODY = /^(\d{2})[-.\s]?(\d{2})[.\s]?(\d{3})\s*$/;

/** 7 digits of a pourvoi number in any accepted spelling; null if not one. */
export function pourvoiDigits(raw: string): string | null {
  const m = POURVOI_BODY.exec(raw.replace(POURVOI_PREFIX, ''));
  return m ? `${m[1]}${m[2]}${m[3]}` : null;
}

/** "24-16.924" from any accepted spelling; null if not a pourvoi number. */
export function formatPourvoi(raw: string): string | null {
  const d = pourvoiDigits(raw);
  return d ? `${d.slice(0, 2)}-${d.slice(2, 4)}.${d.slice(4)}` : null;
}

const ECLI = /^ECLI:[A-Z]{2}:[A-Z0-9.]{1,7}:\d{4}:[A-Z0-9.]+$/;

/** Trimmed, uppercased ECLI; null when malformed. */
export function normalizeEcli(raw: string): string | null {
  const e = raw.trim().toUpperCase();
  return ECLI.test(e) ? e : null;
}

const CONSTITUTIONAL_NATURE = /\s+(?:QPC|DC|L|LOM|LP|ORGA|RIP|AN|SEN|ELEC|D|I|FNR)$/i;

/** The number as the collection's number field expects it. */
export function normalizeCaseNumber(collection: CaseLawCollection, raw: string): string {
  const stripped = raw
    .trim()
    .replace(/^n\s*[°o]\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (collection === 'judicial') return formatPourvoi(stripped) ?? stripped;
  if (collection === 'constitutional') return stripped.replace(CONSTITUTIONAL_NATURE, '');
  return stripped;
}

export interface DecisionIdentity {
  ecli: string | null;
  courtOfCassation: boolean;
  date: IsoDate | null;
  /** Pourvoi numbers, in any spelling. */
  pourvois: string[];
}

/**
 * Whether two records, possibly from different sources, are the same decision. Two ECLIs decide;
 * otherwise both must be Cour de cassation decisions of the same date sharing a pourvoi number.
 */
export function sameDecision(a: DecisionIdentity, b: DecisionIdentity): boolean {
  if (a.ecli !== null && b.ecli !== null) return a.ecli === b.ecli;
  if (!a.courtOfCassation || !b.courtOfCassation) return false;
  if (a.date === null || a.date !== b.date) return false;
  const mine = new Set(a.pourvois.map(pourvoiDigits).filter((d) => d !== null));
  return b.pourvois.some((p) => {
    const d = pourvoiDigits(p);
    return d !== null && mine.has(d);
  });
}
