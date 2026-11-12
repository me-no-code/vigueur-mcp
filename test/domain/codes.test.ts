import { describe, expect, it } from 'vitest';
import { resolveCodeName } from '../../src/domain/codes.js';

describe('resolveCodeName', () => {
  it.each([
    ['C. trav.', 'Code du travail'],
    ['C. trav', 'Code du travail'],
    ['c. trav.', 'Code du travail'],
    ['code du travail', 'Code du travail'],
    ['C. civ.', 'Code civil'],
    ['C. com.', 'Code de commerce'],
    ['C. pén.', 'Code pénal'],
    ['C. pen.', 'Code pénal'],
    ['CPC', 'Code de procédure civile'],
    ['C. pr. civ.', 'Code de procédure civile'],
    ['C. proc. civ.', 'Code de procédure civile'],
    ['CPP', 'Code de procédure pénale'],
    ['C. pr. pén.', 'Code de procédure pénale'],
    ['CSS', 'Code de la sécurité sociale'],
    ['C. séc. soc.', 'Code de la sécurité sociale'],
    ['C. sec. soc.', 'Code de la sécurité sociale'],
    ['CGI', 'Code général des impôts'],
    ['C. consom.', 'Code de la consommation'],
    ['CSP', 'Code de la santé publique'],
    ['C. env.', "Code de l'environnement"],
    ['Code de l’environnement', "Code de l'environnement"],
    ['Code de l\u02BCenvironnement', "Code de l'environnement"], // modifier-letter apostrophe
    ['CJA', 'Code de justice administrative'],
    ['CGCT', 'Code général des collectivités territoriales'],
    ['C. urb.', "Code de l'urbanisme"],
    ['CMF', 'Code monétaire et financier'],
    ['C. assur.', 'Code des assurances'],
    ['CPI', 'Code de la propriété intellectuelle'],
    ['CRPA', "Code des relations entre le public et l'administration"],
    ['CCH', "Code de la construction et de l'habitation"],
    ['CESEDA', "Code de l'entrée et du séjour des étrangers et du droit d'asile"],
    ['Code civil', 'Code civil'],
  ])('%j → %j', (input, expected) => {
    expect(resolveCodeName(input)).toBe(expected);
  });

  it.each([
    ['Code minier', 'Code minier'],
    ['code minier', 'Code minier'],
    ['CODE minier', 'Code minier'],
    ['code de l’énergie', "Code de l'énergie"],
    ['code de l\u02BCénergie', "Code de l'énergie"],
  ])('returns unknown full name %j as %j', (input, expected) => {
    expect(resolveCodeName(input)).toBe(expected);
  });

  it.each(['C. xyz.', 'xyz', '', 'CXYZ'])('returns null for %j', (input) => {
    expect(resolveCodeName(input)).toBeNull();
  });
});
