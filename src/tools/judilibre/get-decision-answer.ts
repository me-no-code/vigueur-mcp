import { judilibreDecisionUrl } from '../../domain/links.js';
import type { JudilibreDecisionResult } from '../../services/case-law/judilibre.js';
import type { DecisionZone, JudilibreDecision } from '../../services/case-law/ports.js';
import { VigueurError } from '../../shared/errors.js';
import { DECISION_TITLE_MAX, type Pointer } from '../envelope.js';
import { cut, fitHead, roomAfter, sliceForJson } from '../format.js';
import { type FoundAnswer, type GetDecisionAnswer, SOURCE, TOOL } from './get-decision-output.js';
import { identityLine } from './search-decisions.js';

/** How hard the head's lists and summary are cut, fullest first (see `fitHead`). */
const LEVELS = [
  { items: 30, itemMax: 500, summaryMax: 2000 },
  { items: 10, itemMax: 200, summaryMax: 1000 },
  { items: 3, itemMax: 100, summaryMax: 500 },
  { items: 0, itemMax: 0, summaryMax: 200 },
] as const;
type Limits = (typeof LEVELS)[number];

export interface GetDecisionAnswerOptions {
  /** The call's `request` (`requestEcho`). */
  request: Pointer;
  /** Where the page of the decision text starts. */
  offset: number;
}

const LEGIFRANCE_FACT = "other_source searches Légifrance for this decision's ECLI.";

/** The head of the first page: the summary and lists cut to `lim`; nothing on later pages. */
interface Head {
  summary: FoundAnswer['summary'];
  titles: FoundAnswer['titles'];
  visa: FoundAnswer['visa'];
  rapprochements: FoundAnswer['rapprochements'];
  files: FoundAnswer['files'];
  /** The `(+N more)` marker of each list that was cut. */
  more: string[];
}

const NO_HEAD: Head = {
  summary: null,
  titles: [],
  visa: [],
  rapprochements: [],
  files: [],
  more: [],
};

type Found = Extract<JudilibreDecisionResult, { kind: 'found' }>;

/** What every page of a found decision carries, whatever its head and text. */
interface FoundFixed {
  d: JudilibreDecision;
  zone: Found['zone'];
  zones: FoundAnswer['zones'];
  /** The notes on the decision's zones. */
  notes: string[];
  /** The ECLI Légifrance is searched with, for a Cour de cassation decision that has one. */
  pointer: string | null;
}

function notFoundAnswer(id: string, request: Pointer): GetDecisionAnswer {
  return {
    source: SOURCE,
    outcome: 'not_found',
    warnings: [
      `No Judilibre decision with id "${id}".`,
      'Find decisions with judilibre_search_decisions (a pourvoi number or ECLI works as the query).',
    ],
    id,
    request,
    cached: [],
  };
}

/** Notes on the decision's zones: none marked up, or none of the kind asked for. */
function zoneNotes(
  d: JudilibreDecision,
  zoneMissing: DecisionZone | null,
  offset: number,
): string[] {
  return [
    ...(offset === 0 && d.zones.length === 0 && zoneMissing === null
      ? ['This decision has no zone markup; showing the full text.']
      : []),
    ...(zoneMissing !== null
      ? [
          d.zones.length > 0
            ? `This decision has no "${zoneMissing}" zone; showing the full text.`
            : `This decision has no zone markup, so no "${zoneMissing}" zone; showing the full text.`,
        ]
      : []),
  ];
}

/** The head of the first page: the summary and lists cut to `lim`. */
function decisionHead(d: JudilibreDecision, lim: Limits): Head {
  const more: string[] = [];
  const strings = (label: string, items: string[]): string[] => {
    if (items.length > lim.items) more.push(`${label}: (+${items.length - lim.items} more)`);
    return items.slice(0, lim.items).map((i) => cut(i, lim.itemMax));
  };
  const titles = strings('Titles', d.titles);
  const visa = strings('Visa', d.visa);
  const rapprochements = strings('Rapprochements', d.rapprochements);
  if (d.files.length > lim.items) more.push(`Files: (+${d.files.length - lim.items} more)`);
  return {
    summary: d.summary === null ? null : cut(d.summary, lim.summaryMax),
    titles,
    visa,
    rapprochements,
    files: d.files
      .slice(0, lim.items)
      .map((f) => ({ name: cut(f.name, lim.itemMax), type: f.type, link: f.url })),
    more,
  };
}

/** One page of a found decision: what it always carries, and this page's head, text and part. */
function foundPage(
  fixed: FoundFixed,
  head: Head,
  text: string,
  part: FoundAnswer['part'],
  next: FoundAnswer['next'],
  request: Pointer,
  last: boolean = next === null,
): FoundAnswer {
  const { d, zone, zones, notes, pointer } = fixed;
  return {
    source: SOURCE,
    outcome: 'found',
    // The Légifrance pointer ends the decision: it sits on the page where the text ends.
    warnings: [...notes, ...head.more, ...(pointer !== null && last ? [LEGIFRANCE_FACT] : [])],
    id: d.id,
    ecli: d.ecli,
    link: judilibreDecisionUrl(d.id),
    title: cut(identityLine(d), DECISION_TITLE_MAX),
    jurisdiction: d.jurisdiction.key,
    location: d.location?.label ?? null,
    chamber: d.chamber?.label ?? null,
    decided: d.decisionDate,
    numbers: d.numbers,
    formation: d.formation?.label ?? null,
    publication: d.publication.map((p) => p.label),
    solution: d.solutionFull ?? d.solution?.label ?? d.solutionText,
    source_updated: d.updatedOn,
    attacked:
      d.contested === null
        ? null
        : {
            title: cut(d.contested.title.replace(/\s*\n\s*/g, ', '), DECISION_TITLE_MAX),
            number: d.contested.number,
            decided: d.contested.date,
            read_with:
              d.contested.judilibreId === null ? null : { tool: TOOL, id: d.contested.judilibreId },
          },
    summary: head.summary,
    titles: head.titles,
    visa: head.visa,
    rapprochements: head.rapprochements,
    files: head.files,
    zones,
    zone: zone?.name ?? null,
    part,
    next,
    text,
    other_source:
      pointer !== null && last
        ? { tool: 'legifrance_search_case_law', collection: 'judicial', ecli: pointer }
        : null,
    request,
    cached: [],
  };
}

/**
 * One page (`offset`) of a decision. Only the text is cut; every page carries the identity, the
 * link and the metadata, but the summary, titles, visa, rapprochements and files, which are given
 * on the first page only.
 */
export function buildGetDecisionAnswer(
  result: JudilibreDecisionResult,
  opts: GetDecisionAnswerOptions,
): GetDecisionAnswer {
  if (result.kind === 'not_found') return notFoundAnswer(result.id, opts.request);
  const { decision: d, zone, zoneMissing } = result;
  const { offset } = opts;
  const body = zone?.text ?? d.text;
  const end = body.length;
  if (offset > 0 && offset >= end) {
    throw new VigueurError(
      'invalid_input',
      `"offset" ${offset} is past the end of the text (${end} characters).`,
    );
  }
  const fixed: FoundFixed = {
    d,
    zone,
    zones: [...new Set(d.zones.map((z) => z.zone))],
    notes: zoneNotes(d, zoneMissing, offset),
    pointer: d.jurisdiction.key === 'cc' && d.ecli !== null ? d.ecli : null,
  };
  const headAt = (level: number): Head =>
    offset === 0 ? decisionHead(d, LEVELS[level] as Limits) : NO_HEAD;

  // The frame is measured with the widest part, next and offset, and with the Légifrance pointer
  // and its sentence present (the worst case), so the split does not depend on the page asked.
  const frame = (level: number): string =>
    JSON.stringify(
      foundPage(
        fixed,
        headAt(level),
        '',
        { from: end, to: end, of: end },
        { offset: end },
        { ...opts.request, offset: end },
        true,
      ),
    );
  const framed = fitHead(frame, LEVELS.length, roomAfter);
  const level = Math.max(
    0,
    LEVELS.findIndex((_, lvl) => frame(lvl) === framed),
  );
  const slice = sliceForJson(body, offset, roomAfter(framed));
  const whole = offset === 0 && slice.nextOffset === null;
  return foundPage(
    fixed,
    headAt(level),
    slice.text,
    whole ? null : { from: offset, to: slice.nextOffset ?? end, of: end },
    slice.nextOffset === null ? null : { offset: slice.nextOffset },
    opts.request,
  );
}
