import type { CassChamber } from '../../domain/citations.js';
import type { Labelled } from '../../services/case-law/ports.js';
import { lookup } from '../json.js';

// Cour de cassation label tables, copied from Judilibre's `/taxonomy`. The one addition is a longer `frr` label.

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

/** A key with its label from `table`; an unknown key is its own label. */
export function labelled(table: Readonly<Record<string, string>>, key: string): Labelled {
  return { key, label: lookup(table, key, key) };
}
