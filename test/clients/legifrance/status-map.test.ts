import { describe, expect, it } from 'vitest';
import { mapPisteStatus } from '../../../src/clients/legifrance/status-map.js';

describe('mapPisteStatus', () => {
  it.each([
    ['VIGUEUR', 'in_force'],
    ['VIGUEUR_ETEN', 'in_force'],
    ['VIGUEUR_NON_ETEN', 'in_force'],
    ['VIGUEUR_DIFF', 'deferred'],
    ['ABROGE_DIFF', 'repeal_pending'],
    ['MODIFIE', 'amended'],
    ['MODIFIE_MORT_NE', 'stillborn'],
    ['ABROGE', 'repealed'],
    ['ANNULE', 'annulled'],
    ['DISJOINT', 'severed'],
    ['PERIME', 'expired'],
    ['TRANSFERE', 'transferred'],
    ['DEPLACE', 'transferred'],
    ['SUBSTITUE', 'replaced'],
    ['REMPLACE', 'replaced'],
    ['DENONCE', 'denounced'],
    ['INITIALE', 'initial'],
    ['SANS_ETAT', 'unknown'],
    ['whatever', 'unknown'],
    [null, 'unknown'],
    [undefined, 'unknown'],
  ] as const)('%s -> %s', (raw, expected) => {
    expect(mapPisteStatus(raw)).toBe(expected);
  });
});
