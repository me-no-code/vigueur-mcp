import { foldKey, normalizeTypography } from './text.js';

// canonical Légifrance title → accepted abbreviations
const CODES: Readonly<Record<string, readonly string[]>> = {
  'Code du travail': ['C. trav.'],
  'Code civil': ['C. civ.'],
  'Code de commerce': ['C. com.'],
  'Code pénal': ['C. pén.'],
  'Code de procédure civile': ['CPC', 'C. pr. civ.', 'C. proc. civ.'],
  'Code de procédure pénale': ['CPP', 'C. pr. pén.', 'C. proc. pén.'],
  'Code de la sécurité sociale': ['CSS', 'C. séc. soc.'],
  'Code général des impôts': ['CGI'],
  'Code de la consommation': ['C. consom.'],
  'Code de la santé publique': ['CSP'],
  "Code de l'environnement": ['C. env.'],
  'Code de justice administrative': ['CJA'],
  'Code général des collectivités territoriales': ['CGCT'],
  "Code de l'urbanisme": ['C. urb.'],
  'Code monétaire et financier': ['CMF'],
  'Code des assurances': ['C. assur.'],
  'Code de la propriété intellectuelle': ['CPI'],
  "Code des relations entre le public et l'administration": ['CRPA'],
  "Code de la construction et de l'habitation": ['CCH'],
  "Code de l'entrée et du séjour des étrangers et du droit d'asile": ['CESEDA'],
};

const BY_KEY: ReadonlyMap<string, string> = new Map(
  Object.entries(CODES).flatMap(([title, abbreviations]) =>
    [title, ...abbreviations].map((name) => [foldKey(name), title] as const),
  ),
);

export function resolveCodeName(raw: string): string | null {
  const known = BY_KEY.get(foldKey(raw));
  if (known) return known;

  const s = normalizeTypography(raw).trim();
  // Leading word normalised to "Code"; the rest is kept as typed.
  if (/^code\s/i.test(s)) return `Code${s.slice(4)}`;
  return null;
}
