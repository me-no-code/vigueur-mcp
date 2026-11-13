import { describe, expect, it } from 'vitest';
import { parseCaseLawTitle } from '../../../src/clients/legifrance/case-law-titles.js';

describe('parseCaseLawTitle', () => {
  it('reads a published Cour de cassation judgment with two pourvois', () => {
    expect(
      parseCaseLawTitle(
        'judicial',
        'Cour de cassation, civile, Chambre civile 2, 17 septembre 2026, 24-17.365 24-18.000, Publié au bulletin',
      ),
    ).toEqual({
      court: 'Cour de cassation',
      chamber: 'Chambre civile 2',
      nature: null,
      date: '2026-09-17',
      numbers: ['24-17.365', '24-18.000'],
      publication: 'Publié au bulletin',
    });
  });

  it('reads an opinion of the Cour de cassation', () => {
    expect(
      parseCaseLawTitle(
        'judicial',
        'Cour de cassation, Cour de cassation saisie pour avis, 25 septembre 2025, 25-70.013, Publié au bulletin',
      ),
    ).toEqual({
      court: 'Cour de cassation',
      chamber: 'Cour de cassation saisie pour avis',
      nature: null,
      date: '2025-09-25',
      numbers: ['25-70.013'],
      publication: 'Publié au bulletin',
    });
  });

  it('reads an unpublished Cour de cassation judgment', () => {
    expect(
      parseCaseLawTitle(
        'judicial',
        'Cour de cassation, civile, Chambre sociale, 17 décembre 2025, 24-16.924, Inédit',
      ),
    ).toEqual({
      court: 'Cour de cassation',
      chamber: 'Chambre sociale',
      nature: null,
      date: '2025-12-17',
      numbers: ['24-16.924'],
      publication: 'Inédit',
    });
  });

  it('reads an appeal court judgment without chamber or publication', () => {
    expect(
      parseCaseLawTitle('judicial', "Cour d'appel de Lyon, 3 janvier 2023, 23/000101"),
    ).toEqual({
      court: "Cour d'appel de Lyon",
      chamber: null,
      nature: null,
      date: '2023-01-03',
      numbers: ['23/000101'],
      publication: null,
    });
  });

  it('reads the first of the month and a chamber written before the date', () => {
    expect(
      parseCaseLawTitle(
        'judicial',
        "Cour d'appel de Douai, CHAMBRE 7 SECTION 1er avril 2011, 10/05475",
      ),
    ).toMatchObject({ chamber: 'CHAMBRE 7 SECTION', date: '2011-04-01', numbers: ['10/05475'] });
  });

  it("reads a Conseil d'État order with its publication", () => {
    expect(
      parseCaseLawTitle(
        'administrative',
        "Conseil d'État, Juge des référés, 06/10/2026, 519801, Inédit au recueil Lebon",
      ),
    ).toEqual({
      court: "Conseil d'État",
      chamber: 'Juge des référés',
      nature: null,
      date: '2026-10-06',
      numbers: ['519801'],
      publication: 'Inédit au recueil Lebon',
    });
  });

  it("reads a Conseil d'État decision without publication", () => {
    expect(
      parseCaseLawTitle(
        'administrative',
        "Conseil d'État, 9ème et 10ème chambres réunies, 10/11/2026, 504582",
      ),
    ).toEqual({
      court: "Conseil d'État",
      chamber: '9ème et 10ème chambres réunies',
      nature: null,
      date: '2026-11-10',
      numbers: ['504582'],
      publication: null,
    });
  });

  it('reads an administrative appeal court decision', () => {
    expect(
      parseCaseLawTitle(
        'administrative',
        'CAA de BORDEAUX, 5ème chambre (formation à 3), 10/11/2026, 24BX01296, Inédit au recueil Lebon',
      ),
    ).toEqual({
      court: 'CAA de BORDEAUX',
      chamber: '5ème chambre (formation à 3)',
      nature: null,
      date: '2026-11-10',
      numbers: ['24BX01296'],
      publication: 'Inédit au recueil Lebon',
    });
  });

  it('reads a QPC decision of the Conseil constitutionnel', () => {
    expect(
      parseCaseLawTitle(
        'constitutional',
        'Décision 2026-1217/1218 QPC - 06 août 2026 - M. Bruno N. et M. Joseph A. [x] - Non conformité totale',
      ),
    ).toEqual({
      court: 'Conseil constitutionnel',
      chamber: null,
      nature: 'QPC',
      date: '2026-08-06',
      numbers: ['2026-1217/1218'],
      publication: null,
    });
  });

  it('keeps the whole nature code of an organic-law decision', () => {
    expect(
      parseCaseLawTitle(
        'constitutional',
        'Décision 2026-169 ORGA-rapp - 08 octobre 2026 - Nomination',
      ),
    ).toMatchObject({ nature: 'ORGA-rapp', numbers: ['2026-169'], date: '2026-10-08' });
  });

  it('reads a CNIL deliberation of the restricted formation', () => {
    expect(
      parseCaseLawTitle(
        'cnil',
        'Délibération de la formation restreinte n° SAN-2026-015 du 22 octobre 2026 prononçant une sanction',
      ),
    ).toEqual({
      court: "Commission nationale de l'informatique et des libertés",
      chamber: 'formation restreinte',
      nature: 'Délibération',
      date: '2026-10-22',
      numbers: ['SAN-2026-015'],
      publication: null,
    });
  });

  it('reads a CNIL decision', () => {
    expect(
      parseCaseLawTitle('cnil', 'Décision DR-2026-201 du 20 octobre 2026 autorisant'),
    ).toMatchObject({
      nature: 'Décision',
      chamber: null,
      numbers: ['DR-2026-201'],
      date: '2026-10-20',
    });
  });

  it('reads a CNIL title with a double space and a glued number sign', () => {
    expect(
      parseCaseLawTitle('cnil', 'Délibération n°2026-117 du  22 octobre 2026 portant avis'),
    ).toMatchObject({
      nature: 'Délibération',
      chamber: null,
      numbers: ['2026-117'],
      date: '2026-10-22',
    });
  });

  it('reads a Cour des comptes judgment', () => {
    expect(
      parseCaseLawTitle(
        'financial',
        'COUR DES COMPTES - CHAMBRE DU CONTENTIEUX - Arrêt - 22/10/2026 - Commune de Capesterre-Belle-Eau (Guadeloupe) - Affaire n° 127 - n° S-2026-1144',
      ),
    ).toEqual({
      court: 'COUR DES COMPTES',
      chamber: 'CHAMBRE DU CONTENTIEUX',
      nature: 'Arrêt',
      date: '2026-10-22',
      numbers: ['S-2026-1144'],
      publication: null,
    });
  });

  it("reads a Cour d'appel financière judgment without chamber", () => {
    expect(
      parseCaseLawTitle(
        'financial',
        "Cour d'appel financière - Arrêt d'appel - 21/10/2026 - Centre hospitalier de Guéret - Affaire n° CAF-2025-02 - n° 2026-07",
      ),
    ).toEqual({
      court: "Cour d'appel financière",
      chamber: null,
      nature: "Arrêt d'appel",
      date: '2026-10-21',
      numbers: ['2026-07'],
      publication: null,
    });
  });

  describe('old dot-separated Cour des comptes titles', () => {
    const first =
      "Cour des comptes. 4ème chambre. Arrêt d'appel. 06/05/2010. Centre communal d'action sociale (CCAS) de Polaincourt - Trésorerie d'Amance Faverney (Haute-Saône) - Appel d'un jugement de la chambre régionale des comptes (CRC) de Franche-Comté. n° 57767. Publié au Recueil de jurisprudence.";
    const third =
      "Cour des comptes. 4ème chambre. Arrêt d'appel. 03/02/2011. Centre hospitalier de Compiègne (Oise) - Appel d'une ordonnance du président de la chambre régionale des comptes (CRC) de Picardie. n° 60083. Publié au Recueil de jurisprudence.";

    it('reads court, chamber, nature, date, number and publication', () => {
      expect(parseCaseLawTitle('financial', third)).toEqual({
        court: 'Cour des comptes',
        chamber: '4ème chambre',
        nature: "Arrêt d'appel",
        date: '2011-02-03',
        numbers: ['60083'],
        publication: 'Publié au Recueil de jurisprudence',
      });
    });

    it('reads the first title of the sample', () => {
      expect(parseCaseLawTitle('financial', first)).toMatchObject({
        date: '2010-05-06',
        numbers: ['57767'],
        publication: 'Publié au Recueil de jurisprudence',
      });
    });

    it('has no number and no publication when the title ends with the parties', () => {
      const cut = first.slice(0, first.indexOf(' n° 57767.')).trim();
      expect(parseCaseLawTitle('financial', cut)).toMatchObject({
        date: '2010-05-06',
        numbers: [],
        publication: null,
      });
    });

    it('has no chamber when only the court and the nature precede the date', () => {
      expect(
        parseCaseLawTitle(
          'financial',
          "Cour des comptes. Arrêt d'appel. 03/02/2011. Commune de X. n° 1. Inédit.",
        ),
      ).toMatchObject({
        chamber: null,
        nature: "Arrêt d'appel",
        numbers: ['1'],
        publication: 'Inédit',
      });
    });
  });

  it('accepts non-breaking spaces', () => {
    expect(
      parseCaseLawTitle('judicial', "Cour d'appel de Lyon, 3 janvier 2023, 23/000101"),
    ).toMatchObject({ date: '2023-01-03', numbers: ['23/000101'] });
  });

  it('returns null for a title it does not recognise', () => {
    for (const collection of [
      'judicial',
      'administrative',
      'constitutional',
      'cnil',
      'financial',
    ] as const) {
      expect(parseCaseLawTitle(collection, 'Some unrelated title')).toBeNull();
    }
  });

  it('returns null for an impossible date', () => {
    expect(
      parseCaseLawTitle('judicial', "Cour d'appel de Lyon, 31 février 2023, 23/000101"),
    ).toBeNull();
  });
});
