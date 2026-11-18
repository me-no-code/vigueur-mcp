import type { IsoDate } from '../../domain/dates.js';
import { articleUrlFor } from '../../domain/links.js';
import type { ArticleRef } from '../../domain/relocation.js';
import { coversDate } from '../../domain/status-at.js';
import type {
  ArticleView,
  GetArticleResult,
  Neighbour,
  RelocationView,
} from '../../services/legislation/get-article.js';
import type { ArticleHit } from '../../services/legislation/ports.js';
import { VigueurError } from '../../shared/errors.js';
import { type Pointer, statusValue } from '../envelope.js';
import { roomAfter, sliceForJson } from '../format.js';
import {
  type FoundAnswer,
  type GetArticleAnswer,
  type LookupMiss,
  type LookupMissAnswer,
  MODIFICATION_ACTIONS,
  type NotInForceAnswer,
  SOURCE,
  TOOL,
} from './get-article-output.js';

export interface LookupMissOptions {
  /** The call's `request` (`requestEcho`). */
  request: Pointer;
  /** The id asked for, echoed when no article has it. */
  requestedId: string | null;
}

export interface GetArticleAnswerOptions extends LookupMissOptions {
  detailed: boolean;
  /** Decides past or future tense for where the content moved. */
  today: IsoDate;
  /** Where the page of the article text starts. */
  offset: number;
}

const labelOf = (rawStatus: string | undefined): string | null => rawStatus || null;

/** A move recorded by Légifrance concordance (a source fact); `what` names the text that moved. */
function movedSentence(
  what: string,
  movedTo: readonly ArticleRef[],
  date: IsoDate | null,
  today: IsoDate,
): string {
  const labels = movedTo.map((m) => m.label).join('; ');
  return date !== null && date > today
    ? `Content will move — per Légifrance concordance, ${what} will be at ${labels} from ${date}.`
    : `Content moved — per Légifrance concordance, ${what} is now at ${labels}${date === null ? '' : ` (since ${date})`}.`;
}

function relocationSentence(
  r: RelocationView,
  num: string,
  asOf: IsoDate,
  today: IsoDate,
): string | null {
  // With no later version, the content left when the found version ended.
  const date = r.successor === null ? r.from.validTo : r.successor.validFrom;
  if (r.movedTo.length > 0) {
    return movedSentence(`the text of art. ${num} as of ${asOf}`, r.movedTo, date, today);
  }
  if (r.successor === null || r.sameWording === null) return null;
  const when = date === null ? '' : `in force from ${date}, `;
  const wording = r.sameWording ? 'the same wording' : 'a different wording';
  return `The next version (${when}id ${r.successor.id}) has ${wording}.`;
}

function neighbourValue(n: Neighbour | null) {
  return n === null
    ? null
    : { number: n.num, id: n.id, excerpt: n.excerpt, excerpt_cut: n.truncated, link: n.url };
}

/**
 * One page of a found article: only the text is cut; every page carries every other field, so
 * the status and the link travel with every part of the text.
 */
function foundAnswer(a: ArticleView, opts: GetArticleAnswerOptions): FoundAnswer {
  const { record } = a;
  const { version } = record;
  const fullText = version.text;
  const { offset } = opts;
  if (offset > 0 && offset >= fullText.length) {
    throw new VigueurError(
      'invalid_input',
      `"offset" ${offset} is past the end of the article text (${fullText.length} characters). Call again without "offset".`,
    );
  }
  const page = (
    text: string,
    part: FoundAnswer['part'],
    next: FoundAnswer['next'],
  ): FoundAnswer => ({
    source: SOURCE,
    outcome: 'found',
    warnings: a.warnings,
    id: version.id,
    link: a.url,
    status: statusValue(a.statusAt, a.asOf, version.validToUndetermined === true),
    legifrance_status: labelOf(version.rawStatus),
    code: record.textTitle,
    code_id: record.textId,
    number: version.number,
    section: record.sectionPath,
    section_id: record.sectionCid,
    note: record.nota,
    relocation:
      a.relocation === null
        ? null
        : relocationSentence(a.relocation, version.number || '?', a.asOf, opts.today),
    neighbours:
      a.neighbours === undefined
        ? null
        : {
            previous: neighbourValue(a.neighbours.previous),
            next: neighbourValue(a.neighbours.next),
          },
    versions: opts.detailed
      ? record.versions.map((v) => ({
          id: v.id,
          version: v.version,
          legifrance_status: labelOf(v.rawStatus),
          from: v.validFrom,
          until: v.validTo,
          until_undetermined: v.validToUndetermined,
          shown: v.id === version.id,
        }))
      : null,
    modifications: opts.detailed
      ? record.modifications.map((m) => ({
          action: MODIFICATION_ACTIONS[m.kind],
          by: m.textTitle,
          effective: m.effectiveDate,
        }))
      : null,
    cited_by: opts.detailed ? record.citationsCount : null,
    part,
    next,
    text,
    request: opts.request,
    cached: [],
  });

  // The frame with the widest part and next: what is left of the budget is for the text.
  const end = fullText.length;
  const frame = JSON.stringify(page('', { from: offset, to: end, of: end }, { offset: end }));
  const slice = sliceForJson(fullText, offset, roomAfter(frame));
  const whole = offset === 0 && slice.nextOffset === null;
  return page(
    slice.text,
    whole ? null : { from: offset, to: slice.nextOffset ?? end, of: end },
    slice.nextOffset === null ? null : { offset: slice.nextOffset },
  );
}

/** The end of a period in a sentence. */
const periodEnd = (p: { validTo: IsoDate | null; validToUndetermined: boolean }) =>
  p.validTo ?? (p.validToUndetermined ? 'not yet determined' : 'no end');

function notInForceAnswer(
  r: Extract<GetArticleResult, { kind: 'not_in_force_at_date' }>,
  opts: GetArticleAnswerOptions,
): NotInForceAnswer {
  const article = `Art. ${r.num}${r.codeTitle === null ? '' : ` of ${r.codeTitle}`}`;
  // When a period's dates cover the date, the dated search and the dates disagree: say only
  // what the search found (a warning names the period), never "was not in force".
  const heading = r.periods.some((p) => coversDate(p, r.asOf))
    ? `${article}: Légifrance's dated search found no version in force on ${r.asOf}. Versions on record.`
    : `${article} exists but was not in force on ${r.asOf}.`;
  const moved = r.relocation;
  return {
    source: SOURCE,
    outcome: 'not_in_force',
    warnings: [
      heading,
      ...r.warnings,
      ...(r.possiblyIncomplete === true
        ? ['Légifrance returned a full page of versions: more versions may exist.']
        : []),
      'Call again with an "at_date" inside one of these periods to read that version.',
    ],
    number: r.num,
    code: r.codeTitle,
    on: r.asOf,
    periods: r.periods.map((p) => ({
      id: p.id,
      code: p.codeTitle,
      legifrance_status: labelOf(p.rawStatus),
      from: p.validFrom,
      until: p.validTo,
      until_undetermined: p.validToUndetermined,
      link: articleUrlFor(p.id),
    })),
    relocation:
      moved === undefined
        ? null
        : movedSentence(
            `the text of art. ${r.num} (version ${moved.from.validFrom ?? 'unknown'} → ${periodEnd(moved.from)})`,
            moved.movedTo,
            moved.from.validTo,
            opts.today,
          ),
    incomplete: r.possiblyIncomplete === true,
    request: opts.request,
    cached: [],
  };
}

function severalMatches(
  num: string,
  candidates: readonly ArticleHit[],
  incomplete: boolean,
  request: Pointer,
): LookupMissAnswer {
  const codes = new Set(candidates.map((c) => c.codeTitle));
  const oneCode = codes.size === 1 ? (candidates[0]?.codeTitle ?? null) : null;
  const warnings: string[] = [];
  if (oneCode !== null) {
    // Several versions in force in one code: only the id can tell them apart.
    warnings.push(
      `Article ${num} has several versions in force in ${oneCode} — call again with "id".`,
    );
  } else {
    warnings.push(`Article ${num} exists in several codes — call again with "code".`);
    if (codes.size < candidates.length) {
      warnings.push('Some codes have several versions in force: for those, give the "id".');
    }
  }
  if (incomplete) {
    warnings.push('(Only the first matches are listed — give the code to narrow it down.)');
  }
  return {
    source: SOURCE,
    outcome: 'several_matches',
    warnings,
    number: num,
    code: oneCode,
    candidates: candidates.map((c) => ({
      id: c.id,
      code: c.codeTitle,
      code_id: c.codeId,
      from: c.validFrom,
      legifrance_status: labelOf(c.rawStatus),
      read_with: { tool: TOOL, id: c.id },
    })),
    incomplete,
    request,
    cached: [],
  };
}

function notFoundSentences(
  r: Extract<LookupMiss, { kind: 'not_found' }>,
  requestedId: string | null,
): string[] {
  switch (r.reason) {
    case 'unknown_id':
      return [`No Légifrance article with id ${requestedId ?? '?'}.`];
    case 'no_article':
      return [`No article ${r.num} in ${r.codeTitle ?? 'any code'} on Légifrance.`];
    case 'unknown_code':
      return [
        `Unknown code "${r.codeTitle}": no Légifrance code has this title. Use the full title (e.g. "Code de la route") or omit the code.`,
        ...(r.didYouMean.length > 0
          ? [
              `Did you mean: ${r.didYouMean.join('; ')}? (suggestions only — call again with the exact code title)`,
            ]
          : []),
      ];
  }
}

/**
 * The answer when no single article was found: the candidates, or the miss. Shared with the
 * history tool so both answer a bad citation identically.
 */
export function buildLookupMiss(result: LookupMiss, opts: LookupMissOptions): LookupMissAnswer {
  if (result.kind === 'ambiguous') {
    return severalMatches(
      result.num,
      result.candidates,
      result.possiblyIncomplete === true,
      opts.request,
    );
  }
  return {
    source: SOURCE,
    outcome: 'not_found',
    warnings: notFoundSentences(result, opts.requestedId),
    reason: result.reason,
    id: opts.requestedId,
    number: result.num,
    code: result.codeTitle,
    did_you_mean: result.didYouMean,
    request: opts.request,
    cached: [],
  };
}

/** The answer body (one page of it, for an article). */
export function buildGetArticleAnswer(
  result: GetArticleResult,
  opts: GetArticleAnswerOptions,
): GetArticleAnswer {
  switch (result.kind) {
    case 'found':
      return foundAnswer(result.article, opts);
    case 'not_in_force_at_date':
      // A page of periods, at most: well under MAX_TOOL_TEXT.
      return notInForceAnswer(result, opts);
    default:
      return buildLookupMiss(result, opts);
  }
}
