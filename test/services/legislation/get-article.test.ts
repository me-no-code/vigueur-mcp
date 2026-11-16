import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGetArticle } from '../../../src/services/legislation/get-article.js';
import type { ArticleHit } from '../../../src/services/legislation/ports.js';
import { VigueurError } from '../../../src/shared/errors.js';
import {
  DEFAULT_CODES,
  type FakeLegislationSeed,
  fakeLegislation,
  hitOf,
  lineage,
  makeArticle,
} from '../../helpers/fake-legislation.js';

const TODAY = '2026-11-12';

const OLD_1382_TEXT =
  "Tout fait quelconque de l'homme, qui cause à autrui un dommage, oblige celui par la faute duquel il est arrivé à le réparer.";
const NEW_1382_TEXT =
  "Les présomptions qui ne sont pas établies par la loi, sont laissées à l'appréciation du juge, qui ne doit les admettre que si elles sont graves, précises et concordantes, et dans les cas seulement où la loi admet la preuve par tout moyen.";
const LIVRE_III = 'Livre III : Des différentes manières dont on acquiert la propriété';

// Code civil art. 1382: one lineage (same cid) whose content was replaced on 2016-10-01.
const [OLD_1382, NEW_1382] = lineage(
  makeArticle({
    id: 'LEGIARTI000006438819',
    num: '1382',
    status: 'amended',
    validFrom: '1804-03-21',
    validTo: '2016-10-01',
    text: OLD_1382_TEXT,
    sectionPath: [
      LIVRE_III,
      'Titre IV : Des engagements qui se forment sans convention',
      'Chapitre II : Des délits et des quasi-délits.',
    ],
  }),
  makeArticle({
    id: 'LEGIARTI000032042379',
    num: '1382',
    version: '2.0',
    cid: 'LEGIARTI000006438819',
    validFrom: '2016-10-01',
    text: NEW_1382_TEXT,
    sectionPath: [
      LIVRE_III,
      'Titre IV bis : De la preuve des obligations',
      'Section 3 : La preuve par présomption judiciaire',
    ],
  }),
);

const REF_1240 = {
  id: 'LEGIARTI000032041571',
  num: '1240',
  codeTitle: 'Code civil',
  label: 'Code civil - art. 1240 (V)',
};
const REF_1353 = {
  id: 'LEGIARTI000006438356',
  num: '1353',
  codeTitle: 'Code civil',
  label: 'Code civil - art. 1353 (M)',
};

// Code civil art. 1240: its lineage starts with the old payment article.
const [OLD_1240, NEW_1240] = lineage(
  makeArticle({
    id: 'LEGIARTI000006437044',
    num: '1240',
    status: 'amended',
    validFrom: '1804-03-21',
    validTo: '2016-10-01',
    text: 'Le paiement fait de bonne foi à celui qui est en possession de la créance est valable, encore que le possesseur en soit par la suite évincé.',
  }),
  makeArticle({
    id: 'LEGIARTI000032041571',
    num: '1240',
    version: '2.0',
    cid: 'LEGIARTI000006437044',
    validFrom: '2016-10-01',
    text: OLD_1382_TEXT,
  }),
);

// L1234-1 exists in two codes (fixture 74).
const L1234_1_TRAVAIL = makeArticle({
  id: 'LEGIARTI000006901112',
  num: 'L1234-1',
  codeTitle: 'Code du travail',
  validFrom: '2008-05-01',
});
const L1234_1_CSP = makeArticle({
  id: 'LEGIARTI000006686176',
  num: 'L1234-1',
  codeTitle: 'Code de la santé publique',
  validFrom: '2004-08-07',
});

// Repealed on 2026-10-01 (fixture 108).
const R4217_2 = makeArticle({
  id: 'LEGIARTI000018532352',
  num: 'R4217-2',
  codeTitle: 'Code du travail',
  status: 'repealed',
  validFrom: '2008-05-01',
  validTo: '2026-10-01',
});

const ARTICLES = [OLD_1382, NEW_1382, OLD_1240, NEW_1240, L1234_1_TRAVAIL, L1234_1_CSP, R4217_2];

function setup(seed: FakeLegislationSeed = {}) {
  const fake = fakeLegislation({
    articles: ARTICLES,
    concordance: { [OLD_1382.version.id]: { from: [REF_1353], to: [REF_1240] } },
    ...seed,
  });
  return { ...fake, getArticle: createGetArticle(fake.repo, { today: () => TODAY }) };
}

describe('createGetArticle — article numbers as people type them', () => {
  it.each([
    ['L. 1234-1', 'C. trav.', 'Code du travail', 'L1234-1'],
    ['art. 1240', 'Code civil', 'Code civil', '1240'],
    ['Art.1240', 'C. civ.', 'Code civil', '1240'],
    ['article L1234-1', undefined, null, 'L1234-1'],
    ['Article premier', 'Code civil', 'Code civil', '1'],
    ['art. 1er', 'Code civil', 'Code civil', '1'],
    ['l1234-1', undefined, null, 'L1234-1'],
    ['199 undecies B', 'CGI', 'Code général des impôts', '199 undecies B'],
  ])('%s (code %s) → findArticleAt(%s, %s)', async (number, code, codeTitle, num) => {
    const { getArticle, calls } = setup();
    await getArticle({ number, ...(code !== undefined && { code }) });
    expect(calls.findArticleAt.map((c) => c.args)).toEqual([[codeTitle, num, TODAY]]);
  });

  it('searches with the official code title from the code list', async () => {
    const { getArticle, calls } = setup();
    await getArticle({ code: 'code DE LA sante publique', number: 'L1234-1' });
    expect(calls.findArticleAt[0]?.args[0]).toBe('Code de la santé publique');
  });

  it('a blank code counts as no code', async () => {
    const { getArticle, calls } = setup();
    await getArticle({ code: '  ', number: '1240' });
    expect(calls.findArticleAt[0]?.args[0]).toBeNull();
    expect(calls.listCodes).toEqual([]);
  });
});

describe('createGetArticle — resolution outcomes', () => {
  it('lists every candidate when the number exists in several codes', async () => {
    const { getArticle, calls } = setup();
    const result = await getArticle({ number: 'L1234-1' });
    expect(result).toEqual({
      kind: 'ambiguous',
      num: 'L1234-1',
      candidates: [hitOf(L1234_1_TRAVAIL), hitOf(L1234_1_CSP)],
    });
    expect(calls.getArticle).toEqual([]);
  });

  it('flags the candidate list as possibly incomplete when the first page is full', async () => {
    const hits: ArticleHit[] = Array.from({ length: 20 }, (_, i) => ({
      ...hitOf(L1234_1_CSP),
      id: `LEGIARTI0000000000${String(i).padStart(2, '0')}`,
      codeId: `LEGITEXT0000000000${String(i).padStart(2, '0')}`,
      codeTitle: `Code n° ${i}`,
    }));
    const { getArticle } = setup({
      overrides: { findArticleAt: async () => ({ hits, truncated: true }) },
    });
    const result = await getArticle({ number: 'L1234-1' });
    expect(result).toMatchObject({ kind: 'ambiguous', possiblyIncomplete: true });
    expect(result.kind === 'ambiguous' && result.candidates).toHaveLength(20);
  });

  it('decides "possibly incomplete" from the page the client read, not from the hit count', async () => {
    // 20 matching hits on a page that was not full: the list is complete.
    const hits: ArticleHit[] = Array.from({ length: 20 }, (_, i) => ({
      ...hitOf(L1234_1_CSP),
      id: `LEGIARTI0000000000${String(i).padStart(2, '0')}`,
      codeTitle: `Code n° ${i}`,
    }));
    const { getArticle } = setup({
      overrides: { findArticleAt: async () => ({ hits, truncated: false }) },
    });
    const result = await getArticle({ number: 'L1234-1' });
    expect(result.kind).toBe('ambiguous');
    expect(result).not.toHaveProperty('possiblyIncomplete');
  });

  it('never picks between two versions found in the same code', async () => {
    const twin = { ...hitOf(L1234_1_TRAVAIL), id: 'LEGIARTI000099999999' };
    const { getArticle, calls } = setup({
      overrides: {
        findArticleAt: async () => ({ hits: [hitOf(L1234_1_TRAVAIL), twin], truncated: false }),
      },
    });
    const result = await getArticle({ code: 'Code du travail', number: 'L1234-1' });
    expect(result).toEqual({
      kind: 'ambiguous',
      num: 'L1234-1',
      candidates: [hitOf(L1234_1_TRAVAIL), twin],
    });
    expect(calls.getArticle).toEqual([]);
  });

  it('a hit listed twice is one article', async () => {
    const hit = hitOf(L1234_1_TRAVAIL);
    const { getArticle, calls } = setup({
      overrides: { findArticleAt: async () => ({ hits: [hit, hit], truncated: false }) },
    });
    const result = await getArticle({ number: 'L1234-1' });
    expect(result.kind).toBe('found');
    expect(calls.getArticle.map((c) => c.args)).toEqual([[L1234_1_TRAVAIL.version.id, TODAY]]);
  });

  it('fails as unexpected_response when a listed hit cannot be fetched (Légifrance answered)', async () => {
    const { getArticle } = setup({ overrides: { getArticle: async () => null } });
    const err = await getArticle({ code: 'Code civil', number: '1240' }).catch((e: unknown) => e);
    expect(err).toMatchObject({ kind: 'unexpected_response', details: { source: 'legifrance' } });
    expect((err as Error).message).not.toContain('Try again');
  });

  it('reports a repealed article as not in force, never as not found', async () => {
    const { getArticle, calls } = setup();
    const result = await getArticle({ code: 'Code du travail', number: 'R. 4217-2' });
    expect(result).toEqual({
      kind: 'not_in_force_at_date',
      num: 'R4217-2',
      codeTitle: 'Code du travail',
      asOf: TODAY,
      periods: [hitOf(R4217_2)],
      warnings: [],
    });
    expect(calls.findArticleAllVersions.map((c) => c.args)).toEqual([
      ['Code du travail', 'R4217-2'],
    ]);
  });

  it('names the code of the periods when no code was given and they share one', async () => {
    const { getArticle } = setup();
    const result = await getArticle({ number: 'R4217-2' });
    expect(result).toMatchObject({ kind: 'not_in_force_at_date', codeTitle: 'Code du travail' });
  });

  it('a full page of versions: says more may exist, and names no latest period', async () => {
    const { getArticle, calls } = setup({
      overrides: {
        findArticleAllVersions: async () => ({
          hits: [hitOf(OLD_1382), hitOf(NEW_1382)],
          truncated: true,
        }),
      },
      concordance: { [NEW_1382.version.id]: { from: [], to: [REF_1240] } },
    });
    const result = await getArticle({ code: 'Code civil', number: '1382', atDate: '1700-01-01' });
    expect(result).toMatchObject({ kind: 'not_in_force_at_date', possiblyIncomplete: true });
    expect(result.kind === 'not_in_force_at_date' && result.relocation).toBeUndefined();
    expect(calls.getConcordance).toEqual([]);
  });

  it('lists the periods oldest first', async () => {
    const { getArticle } = setup({
      overrides: {
        findArticleAllVersions: async () => ({
          hits: [hitOf(NEW_1382), hitOf(OLD_1382)],
          truncated: false,
        }),
      },
    });
    const result = await getArticle({ code: 'Code civil', number: '1382', atDate: '1700-01-01' });
    expect(result.kind === 'not_in_force_at_date' && result.periods.map((p) => p.id)).toEqual([
      OLD_1382.version.id,
      NEW_1382.version.id,
    ]);
  });

  it('lists periods with an unknown start last, and a period listed twice once', async () => {
    const undated = { ...hitOf(OLD_1382), id: 'LEGIARTI000000000777', validFrom: null };
    const { getArticle } = setup({
      overrides: {
        findArticleAllVersions: async () => ({
          hits: [undated, hitOf(NEW_1382), hitOf(OLD_1382), hitOf(NEW_1382)],
          truncated: false,
        }),
      },
    });
    const result = await getArticle({ code: 'Code civil', number: '1382', atDate: '1700-01-01' });
    expect(result.kind === 'not_in_force_at_date' && result.periods.map((p) => p.id)).toEqual([
      OLD_1382.version.id,
      NEW_1382.version.id,
      'LEGIARTI000000000777',
    ]);
  });

  it('reports not_found when no version ever had the number', async () => {
    const { getArticle } = setup();
    const result = await getArticle({ code: 'Code civil', number: '99999' });
    expect(result).toEqual({
      kind: 'not_found',
      reason: 'no_article',
      num: '99999',
      codeTitle: 'Code civil',
      didYouMean: [],
    });
  });

  it('reports an unknown code as such, without searching (never "no article")', async () => {
    const { getArticle, calls } = setup();
    const result = await getArticle({ code: 'C. route', number: 'R413-17' });
    expect(result).toEqual({
      kind: 'not_found',
      reason: 'unknown_code',
      num: 'R413-17',
      codeTitle: 'C. route',
      didYouMean: [],
    });
    expect(calls.findArticleAt).toEqual([]);
    expect(calls.findArticleAllVersions).toEqual([]);
  });

  it('reports not_found without searching when the code is unknown', async () => {
    const { getArticle, calls } = setup();
    const result = await getArticle({ code: 'Code des pirates', number: '1240' });
    expect(result).toEqual({
      kind: 'not_found',
      reason: 'unknown_code',
      num: '1240',
      codeTitle: 'Code des pirates',
      didYouMean: [],
    });
    expect(calls.findArticleAt).toEqual([]);
    expect(calls.findArticleAllVersions).toEqual([]);
  });

  it('suggests code titles containing the input, sorted, without substituting', async () => {
    const { getArticle, calls } = setup();
    const result = await getArticle({ code: 'travail', number: 'L1234-1' });
    expect(result).toEqual({
      kind: 'not_found',
      reason: 'unknown_code',
      num: 'L1234-1',
      codeTitle: 'travail',
      didYouMean: [
        'Code du travail',
        'Code du travail applicable à Mayotte',
        'Code du travail maritime',
      ],
    });
    expect(calls.findArticleAt).toEqual([]);
  });

  it('suggests at most five code titles', async () => {
    const { getArticle } = setup();
    const result = await getArticle({ code: 'code', number: '1' });
    expect(DEFAULT_CODES.length).toBeGreaterThan(5);
    expect(result.kind === 'not_found' && result.didYouMean).toEqual([
      'Code civil',
      'Code de commerce',
      'Code de la santé publique',
      'Code du travail',
      'Code du travail applicable à Mayotte',
    ]);
  });
});

describe('createGetArticle — found article', () => {
  it('1240 today: in force, official link, no relocation', async () => {
    const { getArticle, calls } = setup();
    const result = await getArticle({ code: 'Code civil', number: '1240' });
    expect(result).toEqual({
      kind: 'found',
      article: {
        record: NEW_1240,
        asOf: TODAY,
        statusAt: { inForce: true, reason: 'in_force', from: '2016-10-01', until: null },
        warnings: [],
        url: 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032041571',
        relocation: null,
      },
    });
    expect(calls.getArticle.map((c) => c.args)).toEqual([['LEGIARTI000032041571', TODAY]]);
    expect(calls.getConcordance).toEqual([]);
  });

  it('1382 on 2015-01-01: old version, content moved to 1240 per concordance', async () => {
    const { getArticle, calls } = setup();
    const result = await getArticle({ code: 'Code civil', number: '1382', atDate: '2015-01-01' });
    if (result.kind !== 'found') throw new Error(`expected found, got ${result.kind}`);
    const { article } = result;
    expect(article.record.version.id).toBe('LEGIARTI000006438819');
    expect(article.asOf).toBe('2015-01-01');
    expect(article.statusAt).toEqual({
      inForce: true,
      reason: 'in_force',
      from: '1804-03-21',
      until: '2016-10-01',
    });
    expect(article.relocation).toEqual({
      change: 'replaced',
      movedTo: [REF_1240],
      evidence: ['concordance', 'text_similarity', 'section_change'],
      from: OLD_1382.versions[0],
      successor: OLD_1382.versions[1],
    });
    expect(article.relocation?.movedTo[0]?.num).toBe('1240');
    expect(article.relocation?.evidence).toContain('concordance');
    expect(calls.getConcordance.map((c) => c.args)).toEqual([['LEGIARTI000006438819']]);
    expect(calls.getArticle.map((c) => c.args)).toEqual([
      ['LEGIARTI000006438819', '2015-01-01'],
      ['LEGIARTI000032042379', '2016-10-01'],
    ]);
  });

  it('an amendment in the same section carries no relocation evidence', async () => {
    const [v1, v2] = lineage(
      makeArticle({
        id: 'LEGIARTI000000000001',
        num: 'L1',
        codeTitle: 'Code du travail',
        status: 'amended',
        validFrom: '2010-01-01',
        validTo: '2020-01-01',
        text: "Le délai de préavis est d'un mois.",
        sectionPath: ['Chapitre Ier : Préavis'],
      }),
      makeArticle({
        id: 'LEGIARTI000000000002',
        num: 'L1',
        codeTitle: 'Code du travail',
        validFrom: '2020-01-01',
        text: 'Le délai de préavis est de deux mois.',
        sectionPath: ['Chapitre Ier : Préavis'],
      }),
    );
    const { getArticle } = setup({ articles: [v1, v2], concordance: {} });
    const result = await getArticle({ id: v1.version.id });
    expect(result.kind === 'found' && result.article.relocation).toEqual({
      change: 'amended',
      movedTo: [],
      evidence: [],
      from: v1.versions[0],
      successor: v1.versions[1],
    });
  });

  it('takes as successor the earliest later version, skipping still-born ones', async () => {
    const [found, later, stillborn, next] = lineage(
      makeArticle({ id: 'LEGIARTI000000000010', num: '7', validFrom: '2010-01-01' }),
      makeArticle({ id: 'LEGIARTI000000000030', num: '7', validFrom: '2020-01-01' }),
      makeArticle({
        id: 'LEGIARTI000000000020',
        num: '7',
        status: 'stillborn',
        validFrom: '2012-01-01',
        validTo: '2011-06-01',
      }),
      makeArticle({ id: 'LEGIARTI000000000015', num: '7', validFrom: '2015-01-01' }),
    );
    const { getArticle, calls } = setup({ articles: [found, later, stillborn, next] });
    const result = await getArticle({ id: found.version.id, atDate: '2011-01-01' });
    expect(result.kind === 'found' && result.article.relocation?.successor?.id).toBe(
      'LEGIARTI000000000015',
    );
    expect(calls.getArticle[1]?.args).toEqual(['LEGIARTI000000000015', '2015-01-01']);
  });

  it('passes consistency warnings through (status label vs abrogation link)', async () => {
    const l8004 = makeArticle({
      id: 'LEGIARTI000006651050',
      num: 'L800-4',
      codeTitle: 'Code du travail',
      validFrom: '2005-01-28',
      modifications: [
        {
          kind: 'abrogation',
          textTitle: 'Ordonnance n°2007-329 du 12 mars 2007 - art. 12',
          effectiveDate: '2008-05-01',
        },
      ],
    });
    const { getArticle } = setup({ articles: [l8004] });
    const result = await getArticle({ code: 'Code du travail', number: 'L800-4' });
    if (result.kind !== 'found') throw new Error(`expected found, got ${result.kind}`);
    expect(result.article.statusAt.inForce).toBe(true);
    expect(result.article.warnings).toHaveLength(1);
    expect(result.article.warnings[0]).toContain('Ordonnance n°2007-329');
  });
});

describe('createGetArticle — repeal with an undetermined date', () => {
  it('is in force, with a warning that the repeal date is not set', async () => {
    const pending = makeArticle({
      id: 'LEGIARTI000000000300',
      num: 'L800-5',
      codeTitle: 'Code du travail',
      status: 'repeal_pending',
      validFrom: '2005-01-28',
      validToUndetermined: true,
    });
    const { getArticle } = setup({ articles: [pending] });
    const result = await getArticle({ code: 'Code du travail', number: 'L800-5' });
    if (result.kind !== 'found') throw new Error(`expected found, got ${result.kind}`);
    expect(result.article.statusAt).toEqual({
      inForce: true,
      reason: 'in_force',
      from: '2005-01-28',
      until: null,
    });
    expect(result.article.record.version.validToUndetermined).toBe(true);
    expect(result.article.warnings).toEqual(['Repeal scheduled; Légifrance has not set its date.']);
  });

  it('an open-ended version gets no such warning', async () => {
    const { getArticle } = setup();
    const result = await getArticle({ code: 'Code civil', number: '1240' });
    expect(result.kind === 'found' && result.article.warnings).toEqual([]);
  });
});

describe('createGetArticle — relocation is best effort', () => {
  const ABROGATION = {
    kind: 'abrogation' as const,
    textTitle: 'Ordonnance n°2007-329 du 12 mars 2007 - art. 12',
    effectiveDate: '2008-05-01',
  };
  // In force today (with a contradicting abrogation link) and amended in 2030.
  const [CURRENT, SCHEDULED] = lineage(
    makeArticle({
      id: 'LEGIARTI000000000100',
      num: 'L800-4',
      codeTitle: 'Code du travail',
      validFrom: '2005-01-28',
      validTo: '2030-01-01',
      modifications: [ABROGATION],
    }),
    makeArticle({
      id: 'LEGIARTI000000000200',
      num: 'L800-4',
      codeTitle: 'Code du travail',
      status: 'deferred',
      validFrom: '2030-01-01',
    }),
  );

  function failing(error: Error, method: 'getConcordance' | 'successor') {
    return setup({
      articles: [CURRENT, SCHEDULED],
      overrides:
        method === 'getConcordance'
          ? {
              getConcordance: async () => {
                throw error;
              },
            }
          : {
              getArticle: async (id) => {
                if (id === SCHEDULED.version.id) throw error;
                return structuredClone(CURRENT);
              },
            },
    });
  }

  it.each(['getConcordance', 'successor'] as const)(
    'a failing %s call leaves the article found, with a warning',
    async (method) => {
      const upstream = new VigueurError('upstream_unavailable', 'Légifrance: service unavailable.');
      const { getArticle } = failing(upstream, method);
      const result = await getArticle({ id: CURRENT.version.id });
      if (result.kind !== 'found') throw new Error(`expected found, got ${result.kind}`);
      expect(result.article.record.version.id).toBe(CURRENT.version.id);
      expect(result.article.relocation).toBeNull();
      expect(result.article.warnings).toHaveLength(2);
      expect(result.article.warnings[0]).toContain('Ordonnance n°2007-329');
      expect(result.article.warnings[1]).toBe(
        'Could not check where this content moved (Légifrance: service unavailable).',
      );
    },
  );

  it('a failure that is not a VigueurError is a warning too', async () => {
    const { getArticle } = failing(new TypeError('fetch failed'), 'getConcordance');
    const result = await getArticle({ id: CURRENT.version.id });
    expect(result.kind === 'found' && result.article.warnings.at(-1)).toBe(
      'Could not check where this content moved (fetch failed).',
    );
  });

  it.each(['getConcordance', 'successor'] as const)(
    'a cancelled %s call cancels the lookup',
    async (method) => {
      const cancelled = new VigueurError('cancelled', 'Légifrance: request cancelled.');
      const { getArticle } = failing(cancelled, method);
      await expect(getArticle({ id: CURRENT.version.id })).rejects.toBe(cancelled);
    },
  );

  it('a successor that cannot be read relies on the concordance alone', async () => {
    const { getArticle } = setup({
      overrides: {
        getArticle: async (id) => (id === OLD_1382.version.id ? structuredClone(OLD_1382) : null),
      },
    });
    const result = await getArticle({ id: OLD_1382.version.id, atDate: '2015-01-01' });
    if (result.kind !== 'found') throw new Error(`expected found, got ${result.kind}`);
    expect(result.article.relocation).toEqual({
      change: 'replaced',
      movedTo: [REF_1240],
      evidence: ['concordance'],
      from: OLD_1382.versions[0],
      successor: OLD_1382.versions[1],
    });
    expect(result.article.warnings).toEqual([]);
  });

  it('a successor that cannot be read, without concordance, gives no relocation', async () => {
    const { getArticle } = setup({
      articles: [CURRENT, SCHEDULED],
      overrides: { getArticle: async (id) => (id === CURRENT.version.id ? CURRENT : null) },
    });
    const result = await getArticle({ id: CURRENT.version.id });
    if (result.kind !== 'found') throw new Error(`expected found, got ${result.kind}`);
    expect(result.article.relocation).toBeNull();
    expect(result.article.warnings).toHaveLength(1); // the consistency warning only
  });
});

describe('createGetArticle — where content went when no later version exists', () => {
  // Synthetic target: no sample of R4217-2's concordance exists.
  const REF_MOVED = {
    id: 'LEGIARTI000000000400',
    num: 'R4217-9',
    codeTitle: 'Code du travail',
    label: 'Code du travail - art. R4217-9 (V)',
  };
  // L800-4 (fixture 73): VIGUEUR, open-ended, single version, but an abrogation link and
  // concordance links to the 2008 Code du travail (lienConcordes → L1511-1…).
  const ABROGATION = {
    kind: 'abrogation' as const,
    textTitle: 'Ordonnance n°2007-329 du 12 mars 2007 - art. 12',
    effectiveDate: '2008-05-01',
  };
  const L800_4 = makeArticle({
    id: 'LEGIARTI000006651050',
    num: 'L800-4',
    codeTitle: 'Code du travail',
    validFrom: '2005-01-28',
    modifications: [ABROGATION],
  });
  const REF_L1511_1 = {
    id: 'LEGIARTI000006901558',
    num: 'L1511-1',
    codeTitle: 'Code du travail',
    label: 'Code du travail - art. L1511-1 (VD)',
  };

  it('a found version marked in force but recorded as repealed points to where its content went', async () => {
    const { getArticle, calls } = setup({
      articles: [L800_4],
      concordance: { [L800_4.version.id]: { from: [], to: [REF_L1511_1] } },
    });
    const result = await getArticle({ code: 'Code du travail', number: 'L800-4' });
    if (result.kind !== 'found') throw new Error(`expected found, got ${result.kind}`);
    expect(result.article.statusAt.inForce).toBe(true);
    expect(result.article.relocation).toEqual({
      change: 'replaced',
      movedTo: [REF_L1511_1],
      evidence: ['concordance'],
      from: L800_4.versions[0],
      successor: null,
    });
    expect(result.article.warnings).toHaveLength(1); // the label/abrogation inconsistency
    expect(calls.getConcordance.map((c) => c.args)).toEqual([[L800_4.version.id]]);
  });

  it('a found version that ended with no later version points to where its content went', async () => {
    const { getArticle, calls } = setup({
      concordance: { [R4217_2.version.id]: { from: [], to: [REF_MOVED] } },
    });
    const result = await getArticle({ id: R4217_2.version.id, atDate: '2015-01-01' });
    if (result.kind !== 'found') throw new Error(`expected found, got ${result.kind}`);
    expect(result.article.relocation).toEqual({
      change: 'replaced',
      movedTo: [REF_MOVED],
      evidence: ['concordance'],
      from: R4217_2.versions[0],
      successor: null,
    });
    expect(calls.getArticle).toHaveLength(1); // no successor to read
  });

  it('a found version with no end, no abrogation link and no successor costs no concordance call', async () => {
    const { getArticle, calls } = setup();
    const result = await getArticle({ code: 'Code civil', number: '1240' });
    expect(result.kind === 'found' && result.article.relocation).toBeNull();
    expect(calls.getConcordance).toEqual([]);
  });

  it('an ended version whose concordance is empty has no relocation', async () => {
    const { getArticle } = setup();
    const result = await getArticle({ id: R4217_2.version.id, atDate: '2015-01-01' });
    expect(result.kind === 'found' && result.article.relocation).toBeNull();
  });

  it('a repealed article not in force on the date points to where its last version went', async () => {
    const { getArticle, calls } = setup({
      concordance: { [R4217_2.version.id]: { from: [], to: [REF_MOVED] } },
    });
    const result = await getArticle({ code: 'Code du travail', number: 'R4217-2' });
    expect(result).toEqual({
      kind: 'not_in_force_at_date',
      num: 'R4217-2',
      codeTitle: 'Code du travail',
      asOf: TODAY,
      periods: [hitOf(R4217_2)],
      warnings: [],
      relocation: { from: hitOf(R4217_2), movedTo: [REF_MOVED] },
    });
    expect(calls.getConcordance.map((c) => c.args)).toEqual([[R4217_2.version.id]]);
  });

  it('reads the concordance of the latest real period only, never of a still-born one', async () => {
    const [first, last, stillborn] = lineage(
      makeArticle({
        id: 'LEGIARTI000000000501',
        num: 'R1',
        codeTitle: 'Code du travail',
        status: 'amended',
        validFrom: '2000-01-01',
        validTo: '2010-01-01',
      }),
      makeArticle({
        id: 'LEGIARTI000000000502',
        num: 'R1',
        codeTitle: 'Code du travail',
        status: 'repealed',
        validFrom: '2010-01-01',
        validTo: '2020-01-01',
      }),
      makeArticle({
        id: 'LEGIARTI000000000503',
        num: 'R1',
        codeTitle: 'Code du travail',
        status: 'stillborn',
        validFrom: '2022-01-01',
        validTo: '2021-01-01',
      }),
    );
    const { getArticle, calls } = setup({
      articles: [first, last, stillborn],
      concordance: { [last.version.id]: { from: [], to: [REF_MOVED] } },
    });
    const result = await getArticle({ code: 'Code du travail', number: 'R1' });
    expect(result).toMatchObject({
      kind: 'not_in_force_at_date',
      relocation: { from: hitOf(last), movedTo: [REF_MOVED] },
    });
    expect(calls.getConcordance.map((c) => c.args)).toEqual([[last.version.id]]);
  });

  it('no concordance call when the latest period has not ended (not yet in force on the date)', async () => {
    const { getArticle, calls } = setup();
    const result = await getArticle({ code: 'Code civil', number: '1382', atDate: '1700-01-01' });
    expect(result.kind).toBe('not_in_force_at_date');
    expect(result).not.toHaveProperty('relocation');
    expect(calls.getConcordance).toEqual([]);
  });

  it('no concordance call when the periods span several codes', async () => {
    const elsewhere = makeArticle({
      id: 'LEGIARTI000000000600',
      num: 'R4217-2',
      codeTitle: 'Code pénal',
      status: 'repealed',
      validFrom: '2008-05-01',
      validTo: '2026-10-01',
    });
    const { getArticle, calls } = setup({ articles: [R4217_2, elsewhere] });
    const result = await getArticle({ number: 'R4217-2' });
    expect(result).toMatchObject({ kind: 'not_in_force_at_date', codeTitle: null });
    expect(calls.getConcordance).toEqual([]);
  });

  it('a failing concordance call on the not-in-force path is a warning', async () => {
    const { getArticle } = setup({
      overrides: {
        getConcordance: async () => {
          throw new VigueurError('upstream_unavailable', 'Légifrance: service unavailable.');
        },
      },
    });
    const result = await getArticle({ code: 'Code du travail', number: 'R4217-2' });
    expect(result).toMatchObject({
      kind: 'not_in_force_at_date',
      warnings: ['Could not check where this content moved (Légifrance: service unavailable).'],
    });
    expect(result).not.toHaveProperty('relocation');
  });

  it('a cancelled concordance call cancels the lookup, on both paths', async () => {
    const cancelled = new VigueurError('cancelled', 'Légifrance: request cancelled.');
    const { getArticle } = setup({
      overrides: {
        getConcordance: async () => {
          throw cancelled;
        },
      },
    });
    await expect(getArticle({ code: 'Code du travail', number: 'R4217-2' })).rejects.toBe(
      cancelled,
    );
    await expect(getArticle({ id: R4217_2.version.id, atDate: '2015-01-01' })).rejects.toBe(
      cancelled,
    );
  });
});

describe('createGetArticle — not in force per the dated search, but the dates disagree', () => {
  it('warns when a period covers the date instead of claiming it was not in force', async () => {
    const { getArticle } = setup({
      overrides: { findArticleAt: async () => ({ hits: [], truncated: false }) },
    });
    const result = await getArticle({
      code: 'Code du travail',
      number: 'R4217-2',
      atDate: '2015-01-01',
    });
    expect(result).toMatchObject({
      kind: 'not_in_force_at_date',
      warnings: [
        "Légifrance's dated search found no version for 2015-01-01, but this period covers it: ABROGE 2008-05-01 → 2026-10-01 (LEGIARTI000018532352).",
      ],
    });
  });

  it('a still-born period never covers the date', async () => {
    const stillborn = makeArticle({
      id: 'LEGIARTI000000000700',
      num: 'R9',
      codeTitle: 'Code du travail',
      status: 'stillborn',
      validFrom: '2010-01-01',
      validTo: '2030-01-01',
    });
    const { getArticle } = setup({
      articles: [stillborn],
      overrides: { findArticleAt: async () => ({ hits: [], truncated: false }) },
    });
    const result = await getArticle({ code: 'Code du travail', number: 'R9' });
    expect(result).toMatchObject({ kind: 'not_in_force_at_date', warnings: [] });
  });
});

describe('createGetArticle — by id', () => {
  it('fetches the version by id at the requested date', async () => {
    const { getArticle, calls } = setup();
    const result = await getArticle({ id: ' LEGIARTI000006438819 ', atDate: '2020-01-01' });
    if (result.kind !== 'found') throw new Error(`expected found, got ${result.kind}`);
    expect(result.article.statusAt).toMatchObject({ inForce: false, reason: 'ended' });
    expect(calls.listCodes).toEqual([]);
    expect(calls.findArticleAt).toEqual([]);
    expect(calls.getArticle[0]?.args).toEqual(['LEGIARTI000006438819', '2020-01-01']);
  });

  it('accepts collective agreement article ids and links them as such', async () => {
    const kali = makeArticle({ id: 'KALIARTI000005849443', num: '1', codeTitle: null });
    const { getArticle, calls } = setup({ articles: [kali] });
    const result = await getArticle({ id: 'KALIARTI000005849443' });
    expect(calls.getArticle[0]?.args).toEqual(['KALIARTI000005849443', TODAY]);
    expect(result.kind === 'found' && result.article.url).toBe(
      'https://www.legifrance.gouv.fr/conv_coll/article/KALIARTI000005849443',
    );
  });

  it('reports an unknown id as not_found', async () => {
    const { getArticle } = setup();
    const result = await getArticle({ id: 'LEGIARTI000000000999' });
    expect(result).toEqual({
      kind: 'not_found',
      reason: 'unknown_id',
      num: null,
      codeTitle: null,
      didYouMean: [],
    });
  });

  it.each([
    'JORFARTI000033934948',
    'LEGITEXT000006070721',
    'LEGIARTI00003204157',
    'legiarti000032041571',
    '1240',
  ])('rejects id %s, naming the supported prefixes', async (id) => {
    const { getArticle, calls } = setup();
    const error = await getArticle({ id }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(VigueurError);
    expect(error).toMatchObject({ kind: 'invalid_input' });
    const message = (error as VigueurError).message;
    expect(message).toContain('LEGIARTI');
    expect(message).toContain('KALIARTI');
    expect(message).toMatch(/number/);
    expect(calls.getArticle).toEqual([]);
  });
});

describe('createGetArticle — input validation', () => {
  it.each([
    ['an impossible date', { number: '1240', atDate: '2015-13-01' }],
    ['a non-ISO date', { number: '1240', atDate: '12/03/2024' }],
    ['neither number nor id', {}],
    ['only a code', { code: 'Code civil' }],
    ['both number and id', { number: '1240', id: 'LEGIARTI000032041571' }],
    ['a blank number', { number: '   ' }],
    ['a number that is only "art."', { number: 'art.' }],
  ])('rejects %s with invalid_input', async (_label, input) => {
    const { getArticle, calls } = setup();
    await expect(getArticle(input)).rejects.toMatchObject({ kind: 'invalid_input' });
    expect(Object.values(calls).flat()).toEqual([]);
  });
});

describe('createGetArticle — context and defaults', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('passes ctx to every repository call', async () => {
    const { getArticle, calls } = setup();
    const ctx = { signal: new AbortController().signal };
    await getArticle({ code: 'Code civil', number: '1382', atDate: '2015-01-01' }, ctx);
    await getArticle({ code: 'Code du travail', number: 'R4217-2' }, ctx);
    const recorded = Object.values(calls).flat();
    // 1382: concordance of the found version; R4217-2: concordance of its last period.
    expect(calls.getConcordance).toHaveLength(2);
    expect(calls.findArticleAllVersions).toHaveLength(1);
    expect(recorded).toHaveLength(9);
    for (const call of recorded) expect(call.ctx?.signal).toBe(ctx.signal);
  });

  it('defaults the date to the current day in Paris', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-11T23:30:00Z')); // already 2026-11-12 in Paris
    const fake = fakeLegislation({ articles: ARTICLES });
    const result = await createGetArticle(fake.repo)({ code: 'Code civil', number: '1240' });
    expect(result.kind === 'found' && result.article.asOf).toBe('2026-11-12');
    expect(fake.calls.findArticleAt[0]?.args[2]).toBe('2026-11-12');
  });
});
