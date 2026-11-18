import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { judilibreDecisionUrl } from '../../domain/links.js';
import type { JudilibreDecisionResult } from '../../services/case-law/judilibre.js';
import type { CallContext, DecisionZone } from '../../services/case-law/ports.js';
import { VigueurError } from '../../shared/errors.js';
import {
  type AnswerBody,
  answerSchema,
  chamberSchema,
  DECISION_TITLE_MAX,
  dateSchema,
  decidedSchema,
  decisionTitleSchema,
  ecliSchema,
  formationSchema,
  judilibreIdSchema,
  judilibreJurisdictionSchema,
  judilibreLinkSchema,
  locationSchema,
  nextSchema,
  numbersSchema,
  type Pointer,
  partSchema,
  pointerSchema,
  publicationListSchema,
  requestEcho,
  solutionSchema,
  type ToolContext,
  toolAnswer,
} from '../envelope.js';
import { callSignal, cut, FRAME_SLACK, fitHead, MAX_TOOL_TEXT, sliceForJson } from '../format.js';
import { toolError } from '../tool-error.js';
import { identityLine } from './search-decisions.js';

const TOOL = 'judilibre_get_decision';
const SOURCE = 'Judilibre';

export type GetDecision = (
  input: { id: string; zone?: DecisionZone },
  ctx?: CallContext,
) => Promise<JudilibreDecisionResult>;

const DESCRIPTION =
  'Read a decision from Judilibre by its id (given in judilibre_search_decisions results and in the "attacked" field of a decision). Returns the identity, the official link, the formation, publication and outcome, the attacked decision, the Cour de cassation\'s summary, visa and rapprochements when it has them, and the full text verbatim (names pseudonymised by the source). ' +
  'Cour de cassation decisions carry zones: "zone" returns one part (introduction, expose, moyens, motivations, dispositif, annexes); a decision without that zone is shown in full. Long texts are paged with "offset". Decisions of the Conseil d\'État, Conseil constitutionnel, CNIL and the financial courts are read with legifrance_get_decision.';

const inputSchema = z.object({
  id: z.string().describe('Judilibre decision id: 24 hexadecimal characters.'),
  zone: z
    .enum(['introduction', 'expose', 'moyens', 'motivations', 'dispositif', 'annexes'])
    .optional()
    .describe('Return only this part of the decision (when the source marks zones).'),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Character offset to continue a long text from; the previous page says which.'),
});

/** How hard the head's lists and summary are cut, fullest first (see `fitHead`). */
const LEVELS = [
  { items: 30, itemMax: 500, summaryMax: 2000 },
  { items: 10, itemMax: 200, summaryMax: 1000 },
  { items: 3, itemMax: 100, summaryMax: 500 },
  { items: 0, itemMax: 0, summaryMax: 200 },
] as const;
type Limits = (typeof LEVELS)[number];

// ---------------------------------------------------------------------------------------------
// Output schema

const foundBranch = answerSchema(SOURCE, 'found', {
  id: judilibreIdSchema,
  ecli: ecliSchema,
  link: judilibreLinkSchema,
  title: decisionTitleSchema.describe(
    'Court, chamber, decision date, numbers and ECLI as one line; cut to 300 characters.',
  ),
  jurisdiction: judilibreJurisdictionSchema,
  location: locationSchema,
  chamber: chamberSchema,
  decided: decidedSchema,
  numbers: numbersSchema,
  formation: formationSchema,
  publication: publicationListSchema,
  solution: solutionSchema.describe(
    "Outcome of the decision: the last step's full label when Judilibre gives one, else its outcome label or text; null when not given.",
  ),
  source_updated: dateSchema
    .nullable()
    .describe('When Judilibre last updated the decision; null when not given.'),
  attacked: z
    .object({
      title: z
        .string()
        .describe('The attacked decision, court and chamber as Judilibre gives them.'),
      number: z.string().nullable().describe('Its number; null when not given.'),
      decided: dateSchema.nullable().describe('Its date; null when not given.'),
      read_with: pointerSchema
        .nullable()
        .describe('The tool call that returns it when Judilibre holds it; null otherwise.'),
    })
    .nullable()
    .describe('The decision attacked, when the source states it; null otherwise.'),
  summary: z
    .string()
    .nullable()
    .describe(
      "The Cour de cassation's summary (sommaire), cut when long; null when there is none and on every page after the first.",
    ),
  titles: z
    .array(z.string())
    .describe(
      'The titles of the summary, each cut when long; empty on every page after the first.',
    ),
  visa: z
    .array(z.string())
    .describe(
      'The texts the decision is based on, each cut when long; empty on every page after the first.',
    ),
  rapprochements: z
    .array(z.string())
    .describe('Related decisions, each cut when long; empty on every page after the first.'),
  files: z
    .array(z.object({ name: z.string(), type: z.string(), link: z.string().nullable() }))
    .describe(
      "Documents attached to the decision; empty on every page after the first. link is null when the source's link does not point to Judilibre.",
    ),
  zones: z.array(z.string()).describe('The zones the source marks in the text; empty when none.'),
  zone: z
    .string()
    .nullable()
    .describe('The zone the text shown is limited to; null when it is the whole decision.'),
  part: partSchema.nullable().describe('The characters of the text shown; null when it is whole.'),
  next: nextSchema,
  text: z
    .string()
    .describe(
      'The text of the decision verbatim (the part shown); names are pseudonymised by the source.',
    ),
  other_source: pointerSchema
    .nullable()
    .describe(
      "The call that searches Légifrance for this decision's ECLI; given on the last page of a Cour de cassation decision with an ECLI, else null.",
    ),
});

const notFoundBranch = answerSchema(SOURCE, 'not_found', {
  id: z.string().describe('The decision id looked up.'),
});

export const getDecisionOutput = z.discriminatedUnion('outcome', [foundBranch, notFoundBranch]);

// ---------------------------------------------------------------------------------------------
// Answer builder

export type GetDecisionAnswer = AnswerBody<z.input<typeof getDecisionOutput>>;
type FoundAnswer = AnswerBody<z.input<typeof foundBranch>>;

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

/**
 * One page (`offset`) of a decision. Only the text is cut; every page carries the identity, the
 * link and the metadata, but the summary, titles, visa, rapprochements and files, which are given
 * on the first page only.
 */
export function buildGetDecisionAnswer(
  result: JudilibreDecisionResult,
  opts: GetDecisionAnswerOptions,
): GetDecisionAnswer {
  if (result.kind === 'not_found') {
    return {
      source: SOURCE,
      outcome: 'not_found',
      warnings: [
        `No Judilibre decision with id "${result.id}".`,
        'Find decisions with judilibre_search_decisions (a pourvoi number or ECLI works as the query).',
      ],
      id: result.id,
      request: opts.request,
      cached: [],
    };
  }
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
  const pointer = d.jurisdiction.key === 'cc' && d.ecli !== null ? d.ecli : null;
  const zones = [...new Set(d.zones.map((z) => z.zone))];
  const zoneNotes = [
    ...(offset === 0 && zones.length === 0 && zoneMissing === null
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
  const headAt = (level: number): Head => {
    if (offset !== 0) return NO_HEAD;
    const lim = LEVELS[level] as Limits;
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
  };
  const page = (
    head: Head,
    text: string,
    part: FoundAnswer['part'],
    next: FoundAnswer['next'],
    request: Pointer,
    last: boolean = next === null,
  ): FoundAnswer => ({
    source: SOURCE,
    outcome: 'found',
    // The Légifrance pointer ends the decision: it sits on the page where the text ends.
    warnings: [...zoneNotes, ...head.more, ...(pointer !== null && last ? [LEGIFRANCE_FACT] : [])],
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
  });

  // The frame is measured with the widest part, next and offset, and with the Légifrance pointer
  // and its sentence present (the worst case), so the split does not depend on the page asked.
  const frame = (level: number): string =>
    JSON.stringify(
      page(
        headAt(level),
        '',
        { from: end, to: end, of: end },
        { offset: end },
        { ...opts.request, offset: end },
        true,
      ),
    );
  const roomLeft = (framed: string): number => MAX_TOOL_TEXT - framed.length - FRAME_SLACK;
  const framed = fitHead(frame, LEVELS.length, roomLeft);
  const level = Math.max(
    0,
    LEVELS.findIndex((_, lvl) => frame(lvl) === framed),
  );
  const slice = sliceForJson(body, offset, roomLeft(framed));
  const whole = offset === 0 && slice.nextOffset === null;
  return page(
    headAt(level),
    slice.text,
    whole ? null : { from: offset, to: slice.nextOffset ?? end, of: end },
    slice.nextOffset === null ? null : { offset: slice.nextOffset },
    opts.request,
  );
}

export function registerGetDecisionTool(
  server: McpServer,
  getDecision: GetDecision,
  ctx: ToolContext,
): void {
  server.registerTool(
    TOOL,
    {
      title: 'Read a Judilibre decision',
      description: DESCRIPTION,
      inputSchema,
      outputSchema: getDecisionOutput,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args, extra) => {
      const request = requestEcho(TOOL, inputSchema, args, { offset: 0 });
      const signal = callSignal(extra.mcpReq.signal, ctx.deadlineMs);
      try {
        const result = await getDecision({ id: args.id, zone: args.zone }, { signal });
        const body = buildGetDecisionAnswer(result, { request, offset: args.offset ?? 0 });
        return toolAnswer(getDecisionOutput, body, ctx);
      } catch (err) {
        return toolError(err, {
          source: 'judilibre',
          request,
          signal,
          deadlineMs: ctx.deadlineMs,
          now: ctx.now,
        });
      }
    },
  );
}
