import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { decisionUrl } from '../../domain/links.js';
import {
  LEGIFRANCE_CASE_LAW_COVERAGE_NOTE,
  type LegifranceDecisionResult,
} from '../../services/case-law/legifrance.js';
import type { CallContext } from '../../services/case-law/ports.js';
import { VigueurError } from '../../shared/errors.js';
import {
  type AnswerBody,
  answerSchema,
  chamberSchema,
  courtSchema,
  DECISION_TITLE_MAX,
  dateSchema,
  decidedSchema,
  decisionIdSchema,
  decisionPublicationSchema,
  decisionTitleSchema,
  legifranceLinkSchema,
  legifranceStatusSchema,
  natureSchema,
  nextSchema,
  numbersSchema,
  type Pointer,
  partSchema,
  pointerSchema,
  publishedSchema,
  requestEcho,
  solutionSchema,
  type ToolContext,
  toolAnswer,
} from '../envelope.js';
import { callSignal, cut, FRAME_SLACK, fitHead, MAX_TOOL_TEXT, sliceForJson } from '../format.js';
import { toolError } from '../tool-error.js';

const TOOL = 'legifrance_get_decision';
const SOURCE = 'Légifrance';

export type GetDecision = (
  input: { id: string },
  ctx?: CallContext,
) => Promise<LegifranceDecisionResult>;

const DESCRIPTION =
  'Read a decision from Légifrance by its id (JURITEXT, CETATEXT, CONSTEXT, CNILTEXT or JUFITEXT followed by 12 digits, as given in legifrance_search_case_law results). ' +
  'Returns the identity, the official link, the nature, publication and outcome as Légifrance records them, the attacked decision when stated, the summary (sommaire) when there is one, and the full text verbatim (names pseudonymised by the source). ' +
  'Conseil constitutionnel decisions also give the Conseil constitutionnel page and the Journal officiel link; CNIL deliberations the status as Légifrance labels it. Long texts are paged with "offset". ' +
  'A Cour de cassation decision with an ECLI ends with the matching Judilibre search; Judilibre decisions (24 hexadecimal characters) are read with judilibre_get_decision.';

const inputSchema = z.object({
  id: z
    .string()
    .describe('Légifrance decision id, e.g. JURITEXT000053197030 (prefix + 12 digits).'),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Character offset to continue a long text from; the previous page says which.'),
});

/** The summary's cut, fullest first (see `fitHead`). */
const SUMMARY_MAX = [2000, 1000, 500, 200] as const;

// ---------------------------------------------------------------------------------------------
// Output schema

const foundBranch = answerSchema(SOURCE, 'found', {
  id: decisionIdSchema,
  ecli: z.string().nullable().describe('ECLI of the decision; null when not given.'),
  link: legifranceLinkSchema,
  title: decisionTitleSchema,
  court: courtSchema,
  chamber: chamberSchema,
  nature: natureSchema,
  decided: decidedSchema,
  numbers: numbersSchema,
  publication: decisionPublicationSchema,
  solution: solutionSchema,
  legifrance_status: legifranceStatusSchema.describe(
    "Légifrance's status label of a CNIL deliberation; null when it gives none.",
  ),
  published: publishedSchema,
  attacked: z
    .object({
      court: z.string().describe('The court that gave the attacked decision.'),
      decided: dateSchema
        .nullable()
        .describe('Date of the attacked decision; null when not given.'),
    })
    .nullable()
    .describe('The attacked decision, when the source states it; null otherwise.'),
  constitutional_council_link: z
    .string()
    .nullable()
    .describe('Page of the decision on conseil-constitutionnel.fr; null when none.'),
  jo_link: z
    .string()
    .nullable()
    .describe('Link to the Journal officiel publication; null when none.'),
  summary: z
    .string()
    .nullable()
    .describe(
      'The summary (sommaire), cut when long; null when there is none and on every page after the first.',
    ),
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
      'The call that finds the same decision on Judilibre; given on the last page of a judicial decision with an ECLI, else null.',
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

const JUDILIBRE_FACT = 'Same decision on Judilibre (usually earlier, with zones).';

/**
 * One page (`offset`) of a decision. Only the text is cut; every page carries the identity, the
 * link and the metadata, but the summary, which is given on the first page only.
 */
export function buildGetDecisionAnswer(
  result: LegifranceDecisionResult,
  opts: GetDecisionAnswerOptions,
): GetDecisionAnswer {
  if (result.kind === 'not_found') {
    return {
      source: SOURCE,
      outcome: 'not_found',
      warnings: [
        `No Légifrance decision with id "${result.id}".`,
        'Find decisions with legifrance_search_case_law.',
        ...(result.id.startsWith('JURITEXT') ? [LEGIFRANCE_CASE_LAW_COVERAGE_NOTE] : []),
      ],
      id: result.id,
      request: opts.request,
      cached: [],
    };
  }
  const d = result.decision;
  const { offset } = opts;
  const end = d.text.length;
  if (offset > end) {
    throw new VigueurError(
      'invalid_input',
      `"offset" ${offset} is past the end of the text (${end} characters).`,
    );
  }
  const judilibre = d.collection === 'judicial' && d.ecli !== null ? d.ecli : null;
  const page = (
    summary: string | null,
    text: string,
    part: FoundAnswer['part'],
    next: FoundAnswer['next'],
    request: Pointer,
    last: boolean = next === null,
  ): FoundAnswer => ({
    source: SOURCE,
    outcome: 'found',
    // The Judilibre pointer ends the decision: it sits on the page where the text ends.
    warnings: judilibre !== null && last ? [JUDILIBRE_FACT] : [],
    id: d.id,
    ecli: d.ecli,
    link: decisionUrl(d.id),
    title: cut(d.title, DECISION_TITLE_MAX),
    court: d.court,
    chamber: d.chamber,
    nature: d.nature,
    decided: d.decisionDate,
    numbers: d.numbers,
    publication: d.publication,
    solution: d.solution,
    legifrance_status: d.labelledStatus,
    published: d.publishedOn,
    attacked: d.attacked === null ? null : { court: d.attacked.court, decided: d.attacked.date },
    constitutional_council_link: d.constitutionalCouncilUrl,
    jo_link: d.joUrl,
    summary,
    part,
    next,
    text,
    other_source:
      judilibre !== null && last ? { tool: 'judilibre_search_decisions', query: judilibre } : null,
    request,
    cached: [],
  });

  // The frame is measured with the widest part, next and offset, and with the Judilibre pointer
  // and its sentence present (the worst case), so the split does not depend on the page asked.
  const summaryAt = (lvl: number): string | null =>
    offset === 0 && d.summary !== null ? cut(d.summary, SUMMARY_MAX[lvl] as number) : null;
  const frame = (lvl: number): string =>
    JSON.stringify(
      page(
        summaryAt(lvl),
        '',
        { from: end, to: end, of: end },
        { offset: end },
        { ...opts.request, offset: end },
        true,
      ),
    );
  const roomLeft = (head: string): number => MAX_TOOL_TEXT - head.length - FRAME_SLACK;
  const head = fitHead(frame, SUMMARY_MAX.length, roomLeft);
  const level = Math.max(
    0,
    SUMMARY_MAX.findIndex((_, lvl) => frame(lvl) === head),
  );
  const summary = summaryAt(level);
  const slice = sliceForJson(d.text, offset, roomLeft(head));
  const whole = offset === 0 && slice.nextOffset === null;
  return page(
    summary,
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
      title: 'Read a Légifrance decision',
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
        const result = await getDecision({ id: args.id }, { signal });
        const body = buildGetDecisionAnswer(result, { request, offset: args.offset ?? 0 });
        return toolAnswer(getDecisionOutput, body, ctx);
      } catch (err) {
        return toolError(err, {
          source: 'legifrance',
          request,
          signal,
          deadlineMs: ctx.deadlineMs,
          now: ctx.now,
        });
      }
    },
  );
}
