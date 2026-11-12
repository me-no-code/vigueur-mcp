import type { LegalStatus } from '../../domain/versions.js';

const MAP: Readonly<Record<string, LegalStatus>> = {
  VIGUEUR: 'in_force',
  VIGUEUR_ETEN: 'in_force',
  VIGUEUR_NON_ETEN: 'in_force',
  VIGUEUR_DIFF: 'deferred',
  ABROGE_DIFF: 'repeal_pending',
  MODIFIE: 'amended',
  MODIFIE_MORT_NE: 'stillborn',
  ABROGE: 'repealed',
  ANNULE: 'annulled',
  DISJOINT: 'severed',
  PERIME: 'expired',
  TRANSFERE: 'transferred',
  DEPLACE: 'transferred',
  SUBSTITUE: 'replaced',
  REMPLACE: 'replaced',
  DENONCE: 'denounced',
  INITIALE: 'initial',
};

/** Maps a PISTE legal status code to the domain status; anything unrecognised is `unknown`. */
export function mapPisteStatus(etat: string | null | undefined): LegalStatus {
  if (typeof etat !== 'string') return 'unknown';
  return Object.hasOwn(MAP, etat) ? (MAP[etat] as LegalStatus) : 'unknown';
}
