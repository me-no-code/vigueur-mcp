import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import {
  type ReferenceKind,
  type ReferenceView,
  referenceSince,
} from '../../services/legislation/jo.js';
import type { CallContext } from '../../services/legislation/ports.js';
import {
  type AnswerBody,
  answerSchema,
  dateSchema,
  isoSecond,
  type Pointer,
  requestEcho,
  type ToolContext,
  toolAnswer,
} from '../envelope.js';
import {
  callSignal,
  jsonCost,
  optionalIsoDateSchema,
  presentOrUndefined,
  roomAfter,
} from '../format.js';
import { toolError } from '../tool-error.js';

const TOOL = 'legifrance_list_reference_values';
const SOURCE = 'Légifrance';

export type ListReferenceValues = (
  input: { kind: ReferenceKind; since?: string },
  ctx?: CallContext,
) => Promise<ReferenceView>;

const DESCRIPTION =
  'List reference values for other Légifrance tools: "codes" (every French code with its status and id, for the code parameter), "jorf_natures" (kinds of texts published in the Journal officiel, for nature filters), "jorf_emitters" (ministries and authorities that published in the Journal officiel since a date, default one year — names change with governments, so check here before filtering).';

const inputSchema = z.object({
  kind: z
    .enum(['codes', 'jorf_natures', 'jorf_emitters'])
    .describe('Which list: "codes", "jorf_natures" or "jorf_emitters".'),
  since: optionalIsoDateSchema.describe(
    'For jorf_natures and jorf_emitters: start of the publication window, YYYY-MM-DD (publication date). Default: one year ago.',
  ),
});

// ---------------------------------------------------------------------------------------------
// Output schema

const valueSchema = z.object({
  value: z.string().describe('The value, as Légifrance spells it.'),
  id: z.string().nullable().describe('Légifrance id of the code; null for a JORF value.'),
  status: z
    .string()
    .nullable()
    .describe('Status of the code (in_force, repealed…); null for a JORF value.'),
  count: z
    .number()
    .int()
    .nullable()
    .describe('Texts published with this value in the window; null for a code.'),
});

const referenceShape = {
  kind: z.enum(['codes', 'jorf_natures', 'jorf_emitters']).describe('Which list.'),
  since: dateSchema
    .nullable()
    .describe('Start of the publication window of the counts; null for codes.'),
  results: z.number().int().describe('Values in the list.'),
  omitted: z.number().int().describe('Values of the list left out by the answer size limit.'),
  items: z.array(valueSchema).describe('The values, the codes by title, the JORF values by count.'),
};

const resultsBranch = answerSchema(SOURCE, 'results', referenceShape);

export const referenceValuesOutput = z.discriminatedUnion('outcome', [resultsBranch]);

// ---------------------------------------------------------------------------------------------
// Answer builder

export type ReferenceValuesAnswer = AnswerBody<z.input<typeof referenceValuesOutput>>;
type Value = ReferenceValuesAnswer['items'][number];

export interface ReferenceAnswerOptions {
  /** The call's `request` (`requestEcho`). */
  request: Pointer;
}

/** A reference list; values past the answer size limit are left out and counted in `omitted`. */
export function buildReferenceValuesAnswer(
  view: ReferenceView,
  opts: ReferenceAnswerOptions,
): ReferenceValuesAnswer {
  const all: Value[] = view.values.map((v) => ({
    value: v.value,
    id: v.id,
    status: v.status,
    count: v.count,
  }));
  const answer = (items: Value[]): ReferenceValuesAnswer => ({
    source: SOURCE,
    outcome: 'results',
    warnings: [],
    kind: view.kind,
    since: view.since,
    results: all.length,
    omitted: all.length - items.length,
    items,
    request: opts.request,
    cached:
      view.fetchedAt === null
        ? []
        : [{ what: 'Légifrance code list', retrieved: isoSecond(view.fetchedAt) }],
  });

  let room = roomAfter(JSON.stringify(answer([])));
  const items: Value[] = [];
  for (const v of all) {
    room -= jsonCost(v);
    if (room < 0) break;
    items.push(v);
  }
  return answer(items);
}

export function registerReferenceValuesTool(
  server: McpServer,
  listReferenceValues: ListReferenceValues,
  ctx: ToolContext,
): void {
  server.registerTool(
    TOOL,
    {
      title: 'List Légifrance reference values',
      description: DESCRIPTION,
      inputSchema,
      outputSchema: referenceValuesOutput,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args, extra) => {
      const request = requestEcho(TOOL, inputSchema, args, {
        ...(args.kind !== 'codes' && { since: referenceSince(ctx.today()) }),
      });
      const signal = callSignal(extra.mcpReq.signal, ctx.deadlineMs);
      try {
        const view = await listReferenceValues(
          { kind: args.kind, since: presentOrUndefined(args.since) },
          { signal },
        );
        return toolAnswer(
          referenceValuesOutput,
          buildReferenceValuesAnswer(view, { request }),
          ctx,
        );
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
