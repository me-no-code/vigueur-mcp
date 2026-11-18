import { describe, expect, it } from 'vitest';
import type { GetArticleResult } from '../../../src/services/legislation/get-article.js';
import type { VersionSummary } from '../../../src/services/legislation/ports.js';
import { VigueurError } from '../../../src/shared/errors.js';
import { toolAnswer } from '../../../src/tools/envelope.js';
import { buildGetArticleAnswer } from '../../../src/tools/legifrance/get-article-answer.js';
import { getArticleOutput } from '../../../src/tools/legifrance/get-article-output.js';
import { createLegifranceSource } from '../../../src/tools/legifrance/index.js';
import { expectAnswer, expectToolError } from '../../helpers/answer.js';
import { useServers } from '../../helpers/composed-server.js';
import { sandboxConfig } from '../../helpers/fixture-fetch.js';
import {
  fakeServices,
  found,
  link,
  NOW,
  REQUEST,
  TODAY,
  view,
} from '../../helpers/get-article-builders.js';

const TOOL = 'legifrance_get_article';
const SOURCE = 'Légifrance';

type Answer = ReturnType<typeof expectAnswer>;

const { connect } = useServers();

const answer = (
  r: GetArticleResult,
  outcome: string,
  opts: { detailed?: boolean; requestedId?: string } = {},
) =>
  expectAnswer(
    toolAnswer(
      getArticleOutput,
      buildGetArticleAnswer(r, {
        detailed: false,
        today: TODAY,
        requestedId: null,
        offset: 0,
        request: REQUEST,
        ...opts,
      }),
      { now: () => NOW },
    ),
    { source: SOURCE, outcome },
  );

const summary = (over: Partial<VersionSummary> = {}): VersionSummary => ({
  id: 'LEGIARTI000000000002',
  version: '2.0',
  status: 'in_force' as const,
  rawStatus: 'VIGUEUR',
  validFrom: '2020-01-01',
  validTo: null,
  validToUndetermined: false,
  ...over,
});

describe('buildGetArticleAnswer', () => {
  it('found: every field, in order', () => {
    const a = answer(
      found({
        record: {
          ...view().record,
          nota: 'Conformément à l’article 9, ces dispositions entrent en vigueur le 1er janvier 2010.',
          sectionPath: ['Livre Ier', 'Titre II'],
          sectionCid: 'LEGISCTA000000000001',
        },
        warnings: ['Légifrance marks this version in force, but also records its abrogation.'],
      }),
      'found',
    );
    expect(Object.keys(a)).toEqual([
      'source',
      'outcome',
      'warnings',
      'id',
      'link',
      'status',
      'legifrance_status',
      'code',
      'code_id',
      'number',
      'section',
      'section_id',
      'note',
      'relocation',
      'neighbours',
      'versions',
      'modifications',
      'cited_by',
      'part',
      'next',
      'text',
      'request',
      'retrieved',
      'cached',
      'vigueur_version',
    ]);
    expect(a).toMatchObject({
      warnings: ['Légifrance marks this version in force, but also records its abrogation.'],
      id: 'LEGIARTI000000000001',
      link: link('LEGIARTI000000000001'),
      status: {
        state: 'in_force',
        on: '2026-11-12',
        from: '2010-01-01',
        until: null,
        until_undetermined: false,
      },
      legifrance_status: 'VIGUEUR',
      code: 'Code civil',
      code_id: 'LEGITEXT000006070721',
      number: '7',
      section: ['Livre Ier', 'Titre II'],
      section_id: 'LEGISCTA000000000001',
      note: 'Conformément à l’article 9, ces dispositions entrent en vigueur le 1er janvier 2010.',
      relocation: null,
      neighbours: null,
      versions: null,
      modifications: null,
      cited_by: null,
      part: null,
      next: null,
      text: 'Texte officiel.',
      request: REQUEST,
      retrieved: '2026-11-12T09:30:15Z',
      cached: [],
    });
  });

  it('found with no text: an empty text, and no label when Légifrance gives none', () => {
    const base = view({}, '');
    const a = answer(
      found({ record: { ...base.record, version: { ...base.record.version, rawStatus: '' } } }, ''),
      'found',
    );
    expect(a.text).toBe('');
    expect(a.part).toBeNull();
    expect(a.next).toBeNull();
    expect(a.legifrance_status).toBeNull();
  });

  it('detailed: versions (the shown one marked), modifications and citation count', () => {
    const base = view();
    const a = answer(
      found({
        record: {
          ...base.record,
          versions: [
            summary({
              id: 'LEGIARTI000000000001',
              version: '1.0',
              rawStatus: 'VIGUEUR',
              validFrom: '2010-01-01',
            }),
            summary({ status: 'deferred', rawStatus: 'VIGUEUR_DIFF', validFrom: '2027-01-01' }),
          ],
          modifications: [
            { kind: 'creation', textTitle: 'Loi n° 1', effectiveDate: '2010-01-01' },
            { kind: 'modification', textTitle: 'Loi n° 2', effectiveDate: null },
            { kind: 'abrogation', textTitle: 'Loi n° 3', effectiveDate: '2030-01-01' },
            { kind: 'codification', textTitle: 'Ordonnance n° 4', effectiveDate: null },
            { kind: 'other', textTitle: 'Décret n° 5', effectiveDate: null },
          ],
          citationsCount: 1,
        },
      }),
      'found',
      { detailed: true },
    );
    expect(a.versions).toEqual([
      {
        id: 'LEGIARTI000000000001',
        version: '1.0',
        legifrance_status: 'VIGUEUR',
        from: '2010-01-01',
        until: null,
        until_undetermined: false,
        shown: true,
      },
      {
        id: 'LEGIARTI000000000002',
        version: '2.0',
        legifrance_status: 'VIGUEUR_DIFF',
        from: '2027-01-01',
        until: null,
        until_undetermined: false,
        shown: false,
      },
    ]);
    expect(a.modifications).toEqual([
      { action: 'created', by: 'Loi n° 1', effective: '2010-01-01' },
      { action: 'amended', by: 'Loi n° 2', effective: null },
      { action: 'repealed', by: 'Loi n° 3', effective: '2030-01-01' },
      { action: 'codified', by: 'Ordonnance n° 4', effective: null },
      { action: 'linked', by: 'Décret n° 5', effective: null },
    ]);
    expect(a.cited_by).toBe(1);
  });

  it('neighbours: number, id, the excerpt as given, whether it is cut, and the link', () => {
    const neighbour = (n: string, excerpt: string, truncated = true) => ({
      id: `LEGIARTI00000000000${n}`,
      num: n,
      excerpt,
      truncated,
      url: link(`LEGIARTI00000000000${n}`),
    });
    const whole = answer(
      found({ neighbours: { previous: null, next: neighbour('8', 'Article court.', false) } }),
      'found',
    );
    expect(whole.neighbours).toEqual({
      previous: null,
      next: {
        number: '8',
        id: 'LEGIARTI000000000008',
        excerpt: 'Article court.',
        excerpt_cut: false,
        link: link('LEGIARTI000000000008'),
      },
    });
    const a = answer(
      found({
        neighbours: { previous: neighbour('6', 'Premier alinéa.\n\nSecond   alinéa'), next: null },
        warnings: ['Could not read the neighbouring article LEGIARTI000000000008 (boom).'],
      }),
      'found',
    );
    expect(a.neighbours).toEqual({
      previous: {
        number: '6',
        id: 'LEGIARTI000000000006',
        excerpt: 'Premier alinéa.\n\nSecond   alinéa',
        excerpt_cut: true,
        link: link('LEGIARTI000000000006'),
      },
      next: null,
    });
    expect(a.warnings).toEqual([
      'Could not read the neighbouring article LEGIARTI000000000008 (boom).',
    ]);
    expect(answer(found(), 'found').neighbours).toBeNull();
  });

  it('no concordance, next version worded differently: states that fact, with its id', () => {
    const a = answer(
      found({
        asOf: '2015-01-01',
        relocation: {
          sameWording: false,
          movedTo: [],
          from: summary({ id: 'LEGIARTI000000000001' }),
          successor: summary({ id: 'LEGIARTI000000000002', validFrom: '2020-01-01' }),
        },
      }),
      'found',
    );
    expect(a.relocation).toBe(
      'The next version (in force from 2020-01-01, id LEGIARTI000000000002) has a different wording.',
    );
  });

  it('no concordance, next version worded the same: states that fact', () => {
    const a = answer(
      found({
        relocation: {
          sameWording: true,
          movedTo: [],
          from: summary({ id: 'LEGIARTI000000000001' }),
          successor: summary({ id: 'LEGIARTI000000000002', validFrom: '2027-01-01' }),
        },
      }),
      'found',
    );
    expect(a.relocation).toBe(
      'The next version (in force from 2027-01-01, id LEGIARTI000000000002) has the same wording.',
    );
  });

  it('relocation per concordance after today: future tense', () => {
    const a = answer(
      found({
        relocation: {
          sameWording: false,
          movedTo: [
            {
              id: 'LEGIARTI000000000009',
              num: '8',
              codeTitle: 'Code civil',
              label: 'Code civil - art. 8',
            },
          ],
          from: summary({ id: 'LEGIARTI000000000001' }),
          successor: summary({ validFrom: '2027-01-01' }),
        },
      }),
      'found',
    );
    expect(a.relocation).toBe(
      'Content will move — per Légifrance concordance, the text of art. 7 as of 2026-11-12 will be at Code civil - art. 8 from 2027-01-01.',
    );
  });

  it('ambiguous with possibly more candidates says so', () => {
    const hit = {
      num: '1',
      status: 'in_force' as const,
      rawStatus: 'VIGUEUR',
      validFrom: '2000-01-01',
      validTo: null,
      validToUndetermined: false,
    };
    const a = answer(
      {
        kind: 'ambiguous',
        num: '1',
        candidates: [
          {
            ...hit,
            id: 'LEGIARTI000000000001',
            codeId: 'LEGITEXT000000000001',
            codeTitle: 'Code A',
          },
          {
            ...hit,
            id: 'LEGIARTI000000000002',
            codeId: 'LEGITEXT000000000002',
            codeTitle: 'Code B',
          },
        ],
        possiblyIncomplete: true,
      },
      'several_matches',
    );
    expect(a).toMatchObject({
      warnings: [
        'Article 1 exists in several codes — call again with "code".',
        '(Only the first matches are listed — give the code to narrow it down.)',
      ],
      number: '1',
      code: null,
      candidates: [
        {
          id: 'LEGIARTI000000000001',
          code: 'Code A',
          code_id: 'LEGITEXT000000000001',
          from: '2000-01-01',
          legifrance_status: 'VIGUEUR',
          read_with: { tool: TOOL, id: 'LEGIARTI000000000001' },
        },
        {
          id: 'LEGIARTI000000000002',
          code: 'Code B',
          code_id: 'LEGITEXT000000000002',
          from: '2000-01-01',
          legifrance_status: 'VIGUEUR',
          read_with: { tool: TOOL, id: 'LEGIARTI000000000002' },
        },
      ],
      incomplete: true,
    });
  });

  it('ambiguous within one code asks for the id', () => {
    const hit = {
      num: '1',
      codeId: 'LEGITEXT000000000001',
      codeTitle: 'Code A',
      status: 'in_force' as const,
      rawStatus: 'VIGUEUR',
      validTo: null,
      validToUndetermined: false,
    };
    const a = answer(
      {
        kind: 'ambiguous',
        num: '1',
        candidates: [
          { ...hit, id: 'LEGIARTI000000000001', validFrom: '2000-01-01' },
          { ...hit, id: 'LEGIARTI000000000002', validFrom: '2001-01-01' },
        ],
      },
      'several_matches',
    );
    expect(a.warnings).toEqual([
      'Article 1 has several versions in force in Code A — call again with "id".',
    ]);
    expect(a.code).toBe('Code A');
    expect(a.incomplete).toBe(false);
    expect(a.candidates[1]).toMatchObject({
      id: 'LEGIARTI000000000002',
      from: '2001-01-01',
      legifrance_status: 'VIGUEUR',
    });
  });

  it('ambiguous across codes with a repeated code adds the ids', () => {
    const hit = {
      num: '1',
      status: 'in_force' as const,
      rawStatus: 'VIGUEUR',
      validFrom: '2000-01-01',
      validTo: null,
      validToUndetermined: false,
    };
    const a = answer(
      {
        kind: 'ambiguous',
        num: '1',
        candidates: [
          {
            ...hit,
            id: 'LEGIARTI000000000001',
            codeId: 'LEGITEXT000000000001',
            codeTitle: 'Code A',
          },
          {
            ...hit,
            id: 'LEGIARTI000000000002',
            codeId: 'LEGITEXT000000000001',
            codeTitle: 'Code A',
          },
          {
            ...hit,
            id: 'LEGIARTI000000000003',
            codeId: 'LEGITEXT000000000002',
            codeTitle: 'Code B',
          },
        ],
      },
      'several_matches',
    );
    expect(a.warnings).toEqual([
      'Article 1 exists in several codes — call again with "code".',
      'Some codes have several versions in force: for those, give the "id".',
    ]);
    expect(a.code).toBeNull();
    expect(a.candidates.map((c: Answer) => [c.code, c.id])).toEqual([
      ['Code A', 'LEGIARTI000000000001'],
      ['Code A', 'LEGIARTI000000000002'],
      ['Code B', 'LEGIARTI000000000003'],
    ]);
  });

  it('not found by id echoes the requested id', () => {
    const a = answer(
      { kind: 'not_found', reason: 'unknown_id', num: null, codeTitle: null, didYouMean: [] },
      'not_found',
      { requestedId: 'LEGIARTI000000000999' },
    );
    expect(a).toMatchObject({
      warnings: ['No Légifrance article with id LEGIARTI000000000999.'],
      reason: 'unknown_id',
      id: 'LEGIARTI000000000999',
      number: null,
      code: null,
      did_you_mean: [],
    });
  });

  it('not found by number, in one code or in every code', () => {
    const miss = (codeTitle: string | null) =>
      answer(
        { kind: 'not_found', reason: 'no_article', num: '9999', codeTitle, didYouMean: [] },
        'not_found',
      );
    expect(miss(null)).toMatchObject({
      warnings: ['No article 9999 in any code on Légifrance.'],
      reason: 'no_article',
      id: null,
      number: '9999',
      code: null,
    });
    expect(miss('Code civil')).toMatchObject({
      warnings: ['No article 9999 in Code civil on Légifrance.'],
      code: 'Code civil',
    });
  });

  it('an unknown code is never reported as a missing article', () => {
    const a = answer(
      {
        kind: 'not_found',
        reason: 'unknown_code',
        num: 'R413-17',
        codeTitle: 'C. route',
        didYouMean: [],
      },
      'not_found',
    );
    expect(a.reason).toBe('unknown_code');
    expect(a.warnings).toEqual([
      'Unknown code "C. route": no Légifrance code has this title. Use the full title (e.g. "Code de la route") or omit the code.',
    ]);
    expect(JSON.stringify(a)).not.toContain('No article');
  });

  it('an unknown code with code suggestions labels them as such', () => {
    const a = answer(
      {
        kind: 'not_found',
        reason: 'unknown_code',
        num: '1240',
        codeTitle: 'Code civi',
        didYouMean: ['Code civil'],
      },
      'not_found',
    );
    expect(a.did_you_mean).toEqual(['Code civil']);
    expect(a.warnings).toEqual([
      'Unknown code "Code civi": no Légifrance code has this title. Use the full title (e.g. "Code de la route") or omit the code.',
      'Did you mean: Code civil? (suggestions only — call again with the exact code title)',
    ]);
  });

  const period5 = {
    id: 'LEGIARTI000000000005',
    num: '5',
    codeId: 'LEGITEXT000000000001',
    codeTitle: 'Code A',
    status: 'repealed' as const,
    rawStatus: 'ABROGE',
    validFrom: '2000-01-01',
    validTo: '2010-01-01',
    validToUndetermined: false,
  };

  it('not in force at date, across codes, names the code of each period', () => {
    const a = answer(
      {
        kind: 'not_in_force_at_date',
        num: '5',
        codeTitle: null,
        asOf: '1990-01-01',
        periods: [period5],
        warnings: [],
      },
      'not_in_force',
    );
    expect(a).toMatchObject({
      warnings: [
        'Art. 5 exists but was not in force on 1990-01-01.',
        'Call again with an "at_date" inside one of these periods to read that version.',
      ],
      number: '5',
      code: null,
      on: '1990-01-01',
      relocation: null,
    });
    expect(a.periods[0]).toMatchObject({
      code: 'Code A',
      legifrance_status: 'ABROGE',
      from: '2000-01-01',
      until: '2010-01-01',
      until_undetermined: false,
    });
  });

  it('each not-in-force period carries its id and official link', () => {
    const a = answer(
      {
        kind: 'not_in_force_at_date',
        num: '5',
        codeTitle: null,
        asOf: '1990-01-01',
        periods: [period5],
        warnings: [],
      },
      'not_in_force',
    );
    expect(a.periods).toEqual([
      {
        id: 'LEGIARTI000000000005',
        code: 'Code A',
        legifrance_status: 'ABROGE',
        from: '2000-01-01',
        until: '2010-01-01',
        until_undetermined: false,
        link: link('LEGIARTI000000000005'),
      },
    ]);
  });

  it('an end Légifrance has not dated is shown as such, never as "no end"', () => {
    const a = answer(
      {
        kind: 'not_in_force_at_date',
        num: '5',
        codeTitle: 'Code A',
        asOf: '1990-01-01',
        periods: [
          {
            ...period5,
            status: 'repeal_pending',
            rawStatus: 'ABROGE_DIFF',
            validTo: null,
            validToUndetermined: true,
          },
        ],
        warnings: [],
      },
      'not_in_force',
    );
    expect(a.periods[0]).toMatchObject({
      legifrance_status: 'ABROGE_DIFF',
      from: '2000-01-01',
      until: null,
      until_undetermined: true,
    });
  });

  describe('not in force: where the content went, and dates that disagree', () => {
    const period = {
      id: 'LEGIARTI000018532352',
      num: 'R4217-2',
      codeId: 'LEGITEXT000006072050',
      codeTitle: 'Code du travail',
      status: 'repealed' as const,
      rawStatus: 'ABROGE',
      validFrom: '2008-05-01',
      validTo: '2026-10-01',
      validToUndetermined: false,
    };
    const moved = {
      id: 'LEGIARTI000000000400',
      num: 'R4217-9',
      codeTitle: 'Code du travail',
      label: 'Code du travail - art. R4217-9 (V)',
    };
    const notInForce = (
      over: Partial<Extract<GetArticleResult, { kind: 'not_in_force_at_date' }>>,
    ) =>
      answer(
        {
          kind: 'not_in_force_at_date',
          num: 'R4217-2',
          codeTitle: 'Code du travail',
          asOf: TODAY,
          periods: [period],
          warnings: [],
          ...over,
        },
        'not_in_force',
      );

    it('a full page of versions: incomplete, with a warning', () => {
      const a = notInForce({ possiblyIncomplete: true });
      expect(a.incomplete).toBe(true);
      expect(a.warnings).toContain(
        'Légifrance returned a full page of versions: more versions may exist.',
      );
      expect(notInForce({}).incomplete).toBe(false);
    });

    it('past move: labelled per Légifrance concordance, scoped to the last version', () => {
      const a = notInForce({ relocation: { from: period, movedTo: [moved] } });
      expect(a.relocation).toBe(
        'Content moved — per Légifrance concordance, the text of art. R4217-2 (version 2008-05-01 → 2026-10-01) is now at Code du travail - art. R4217-9 (V) (since 2026-10-01).',
      );
      expect(a.warnings[0]).toBe(
        'Art. R4217-2 of Code du travail exists but was not in force on 2026-11-12.',
      );
    });

    it('future move: future tense', () => {
      const later = { ...period, validTo: '2027-01-01' };
      const a = notInForce({
        asOf: '2000-01-01',
        periods: [later],
        relocation: { from: later, movedTo: [moved] },
      });
      expect(a.relocation).toBe(
        'Content will move — per Légifrance concordance, the text of art. R4217-2 (version 2008-05-01 → 2027-01-01) will be at Code du travail - art. R4217-9 (V) from 2027-01-01.',
      );
    });

    it('a period covering the date: no claim that it was not in force, and a warning', () => {
      const warning =
        "Légifrance's dated search found no version for 2015-01-01, but this period covers it: ABROGE 2008-05-01 → 2026-10-01 (LEGIARTI000018532352).";
      const a = notInForce({ asOf: '2015-01-01', warnings: [warning] });
      expect(JSON.stringify(a)).not.toContain('was not in force');
      expect(a.warnings).toEqual([
        "Art. R4217-2 of Code du travail: Légifrance's dated search found no version in force on 2015-01-01. Versions on record.",
        warning,
        'Call again with an "at_date" inside one of these periods to read that version.',
      ]);
    });

    it('other warnings are shown without changing the heading', () => {
      const warning = 'Could not check where this content moved (Légifrance: service unavailable).';
      const a = notInForce({ warnings: [warning] });
      expect(a.warnings[0]).toBe(
        'Art. R4217-2 of Code du travail exists but was not in force on 2026-11-12.',
      );
      expect(a.warnings).toContain(warning);
    });
  });

  it('found, ended with no later version: the concordance move is dated by its end', () => {
    const ref = {
      id: 'LEGIARTI000000000009',
      num: '8',
      codeTitle: 'Code civil',
      label: 'Code civil - art. 8',
    };
    const relocation = (validTo: string | null) => ({
      sameWording: null,
      movedTo: [ref],
      from: summary({ id: 'LEGIARTI000000000001', validFrom: '2010-01-01', validTo }),
      successor: null,
    });
    expect(
      answer(found({ asOf: '2015-01-01', relocation: relocation('2026-10-01') }), 'found')
        .relocation,
    ).toBe(
      'Content moved — per Légifrance concordance, the text of art. 7 as of 2015-01-01 is now at Code civil - art. 8 (since 2026-10-01).',
    );
    expect(answer(found({ relocation: relocation(null) }), 'found').relocation).toBe(
      'Content moved — per Légifrance concordance, the text of art. 7 as of 2026-11-12 is now at Code civil - art. 8.',
    );
  });

  it('found with an undetermined end: status, warning and versions say so', () => {
    const base = view();
    const version = {
      ...base.record.version,
      status: 'repeal_pending' as const,
      rawStatus: 'ABROGE_DIFF',
      validToUndetermined: true,
    };
    const a = answer(
      found({
        record: {
          ...base.record,
          version,
          versions: [
            summary({
              id: version.id,
              status: 'repeal_pending',
              rawStatus: 'ABROGE_DIFF',
              validFrom: '2010-01-01',
              validToUndetermined: true,
            }),
          ],
        },
        warnings: ['Repeal scheduled; Légifrance has not set its date.'],
      }),
      'found',
      { detailed: true },
    );
    expect(a.status).toEqual({
      state: 'in_force',
      on: '2026-11-12',
      from: '2010-01-01',
      until: null,
      until_undetermined: true,
    });
    expect(a.legifrance_status).toBe('ABROGE_DIFF');
    expect(a.warnings).toContain('Repeal scheduled; Légifrance has not set its date.');
    expect(a.versions).toEqual([
      {
        id: 'LEGIARTI000000000001',
        version: '2.0',
        legifrance_status: 'ABROGE_DIFF',
        from: '2010-01-01',
        until: null,
        until_undetermined: true,
        shown: true,
      },
    ]);
  });

  describe('per-call deadline', () => {
    it('answers the deadline error, with the request, when the service outlives it', async () => {
      const client = await connect({
        config: sandboxConfig(),
        getStatus: () => Promise.reject(new Error('not used')),
        sources: [
          createLegifranceSource(
            fakeServices(
              (_input, ctx) =>
                new Promise((_resolve, reject) => {
                  ctx?.signal?.addEventListener('abort', () =>
                    reject(new VigueurError('cancelled', 'cancelled')),
                  );
                }),
            ),
            { today: () => TODAY, deadlineMs: 20 },
          ),
        ],
      });
      const result = await client.callTool({ name: TOOL, arguments: { number: '7' } });
      const e = expectToolError(result, 'deadline');
      expect(e.source).toBe('Légifrance');
      expect(e.error.message).toContain('did not answer within');
      expect(e.request).toEqual(REQUEST);
      expect('retrieved' in e).toBe(false);
    });
  });
});
