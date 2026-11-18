import type { CassChamber } from './decisions.js';

// Judilibre label tables: the source's own wording, copied from its `/taxonomy`. The one addition
// is a longer `frr` label. One copy, used by the client (hit labels) and the tools (header
// criteria) so they cannot drift apart.

export const JURISDICTION_LABELS: Readonly<Record<string, string>> = {
  cc: 'Cour de cassation',
  ca: "Cour d'appel",
  tj: 'Tribunal judiciaire',
  tcom: 'Tribunal de commerce',
  cph: "Conseil de prud'hommes",
};

export const CHAMBER_LABELS: Readonly<Record<string, string>> = {
  pl: 'Assemblée plénière',
  mi: 'Chambre mixte',
  civ1: 'Première chambre civile',
  civ2: 'Deuxième chambre civile',
  civ3: 'Troisième chambre civile',
  comm: 'Chambre commerciale financière et économique',
  soc: 'Chambre sociale',
  cr: 'Chambre criminelle',
  creun: 'Chambres réunies',
  ordo: 'Première présidence (Ordonnance)',
  allciv: 'Toutes les chambres civiles',
  other: 'Autre',
};

/** Courts of appeal by `location` key, verbatim from `/taxonomy`. */
export const CA_LOCATION_LABELS: Readonly<Record<string, string>> = {
  ca_agen: "Cour d'appel d'Agen",
  ca_aix_provence: "Cour d'appel d'Aix-en-Provence",
  ca_amiens: "Cour d'appel d'Amiens",
  ca_angers: "Cour d'appel d'Angers",
  ca_basse_terre: "Cour d'appel de Basse-Terre",
  ca_bastia: "Cour d'appel de Bastia",
  ca_besancon: "Cour d'appel de Besançon",
  ca_bordeaux: "Cour d'appel de Bordeaux",
  ca_bourges: "Cour d'appel de Bourges",
  ca_caen: "Cour d'appel de Caen",
  ca_cayenne: "Cour d'appel de Cayenne",
  ca_chambery: "Cour d'appel de Chambéry",
  ca_colmar: "Cour d'appel de Colmar",
  ca_dijon: "Cour d'appel de Dijon",
  ca_douai: "Cour d'appel de Douai",
  ca_fort_de_france: "Cour d'appel de Fort-de-France",
  ca_grenoble: "Cour d'appel de Grenoble",
  ca_limoges: "Cour d'appel de Limoges",
  ca_lyon: "Cour d'appel de Lyon",
  ca_metz: "Cour d'appel de Metz",
  ca_montpellier: "Cour d'appel de Montpellier",
  ca_nancy: "Cour d'appel de Nancy",
  ca_nimes: "Cour d'appel de Nîmes",
  ca_noumea: "Cour d'appel de Nouméa",
  ca_orleans: "Cour d'appel d'Orléans",
  ca_papeete: "Cour d'appel de Papeete",
  ca_paris: "Cour d'appel de Paris",
  ca_pau: "Cour d'appel de Pau",
  ca_poitiers: "Cour d'appel de Poitiers",
  ca_reims: "Cour d'appel de Reims",
  ca_rennes: "Cour d'appel de Rennes",
  ca_riom: "Cour d'appel de Riom",
  ca_rouen: "Cour d'appel de Rouen",
  ca_st_denis_reunion: "Cour d'appel de Saint-Denis de la Réunion",
  ca_toulouse: "Cour d'appel de Toulouse",
  ca_versailles: "Cour d'appel de Versailles",
};

export const FORMATION_LABELS: Readonly<Record<string, string>> = {
  fp: 'Formation plénière de chambre',
  fm: 'Formation mixte',
  fs: 'Formation de section',
  f: 'Formation restreinte',
  frh: 'Formation restreinte hors RNSM/NA',
  frr: 'Formation restreinte RNSM/NA (rejet non spécialement motivé ou non-admission)',
};

export const PUBLICATION_LABELS: Readonly<Record<string, string>> = {
  b: 'Publié au Bulletin',
  r: 'Publié au Rapport',
  l: 'Publié aux Lettres de chambre',
  c: 'Communiqué',
  n: 'Non publié',
};

export const SOLUTION_LABELS: Readonly<Record<string, string>> = {
  cassation: 'Cassation',
  rejet: 'Rejet',
  annulation: 'Annulation',
  avis: 'Avis',
  decheance: 'Déchéance',
  designation: 'Désignation de juridiction',
  irrecevabilite: 'Irrecevabilité',
  nonlieu: 'Non-lieu à statuer',
  qpc: 'QPC renvoi',
  qpcother: 'QPC autres',
  rabat: 'Rabat',
  reglement: 'Règlement des juges',
  renvoi: 'Renvoi',
  other: 'Autre',
};

/** Judilibre `chamber` wire value for each vigueur chamber. */
export const CHAMBER_WIRE: Readonly<Record<CassChamber, string>> = {
  plenary: 'pl',
  mixed: 'mi',
  civ1: 'civ1',
  civ2: 'civ2',
  civ3: 'civ3',
  commercial: 'comm',
  social: 'soc',
  criminal: 'cr',
};

/** Judilibre `publication` wire value for each vigueur publication filter. */
export const PUBLICATION_WIRE = {
  bulletin: 'b',
  report: 'r',
  chamber_letter: 'l',
  press_release: 'c',
} as const;

/** The label of `key` in `table`; an unknown key is its own label. */
export function labelOf(table: Readonly<Record<string, string>>, key: string): string {
  return Object.hasOwn(table, key) ? (table[key] as string) : key;
}
