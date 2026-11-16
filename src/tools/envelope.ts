import type { CallToolResult } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import type { IsoDate } from '../domain/dates.js';
import type { StatusAt } from '../domain/status-at.js';
import type { HistoryEntry } from '../services/legislation/ports.js';
import { todayInParis } from '../services/legislation/resolve.js';
import { VERSION } from '../version.js';
import { DEFAULT_DEADLINE_MS, presentOrUndefined } from './format.js';

/** The `source` of an answer: a legal source, or PISTE for `vigueur_status`. */
export type SourceName = 'Légifrance' | 'Judilibre' | 'PISTE';

/** What a tool call reads its clock, today's date and its deadline from. */
export interface ToolContext {
  /** The clock `retrieved` is read from. */
  now: () => Date;
  /** Today's date in Paris, which sets the tense of upcoming changes. */
  today: () => IsoDate;
  /** How long a call may take, in milliseconds. */
  deadlineMs: number;
}

/** A tool context; each member left out (or `undefined`) takes its default. */
export function toolContext(opts: Partial<ToolContext> = {}): ToolContext {
  return {
    now: opts.now ?? (() => new Date()),
    today: opts.today ?? todayInParis,
    deadlineMs: opts.deadlineMs ?? DEFAULT_DEADLINE_MS,
  };
}

/** A tool name and its arguments: a call's `request`, or the call that reads an item. */
export type Pointer = { tool: string } & Record<string, string | number | boolean>;

/** Whether a version applies on a date, from its validity dates. */
export interface StatusValue {
  state: 'in_force' | 'not_in_force' | 'not_yet_in_force' | 'never_applied';
  on: IsoDate;
  from: IsoDate | null;
  until: IsoDate | null;
  until_undetermined: boolean;
}

export const dateSchema = z.string().describe('Date, YYYY-MM-DD.');

export const statusSchema = z
  .object({
    state: z.enum(['in_force', 'not_in_force', 'not_yet_in_force', 'never_applied']),
    on: dateSchema.describe('The date the state applies to.'),
    from: dateSchema.nullable().describe('Start of validity; null when the source gives none.'),
    until: dateSchema.nullable().describe('End of validity; null when the source gives none.'),
    until_undetermined: z
      .boolean()
      .describe('Légifrance records an end whose date it has not set.'),
  })
  .describe('Whether the version applies on `on`, computed from its validity dates.');

export const fromSchema = dateSchema.nullable().describe('Start of validity; null when unknown.');

export const untilSchema = dateSchema
  .nullable()
  .describe('End of validity; null when none is dated.');

export const untilUndeterminedSchema = z
  .boolean()
  .describe('Légifrance records an end whose date it has not set.');

export const legifranceStatusSchema = z
  .string()
  .nullable()
  .describe(
    "Légifrance's own status label (VIGUEUR, MODIFIE, ABROGE_DIFF…); null when it gives none.",
  );

export const legifranceLinkSchema = z.string().describe('Official page on legifrance.gouv.fr.');

export const natureSchema = z
  .string()
  .nullable()
  .describe('Nature of the text (LOI, DECRET…); null when not given.');

export const norSchema = z.string().nullable().describe('NOR identifier; null when not given.');

export const publishedSchema = dateSchema
  .nullable()
  .describe('Publication date; null when not given.');

/** Case-law fields shared by the Légifrance case-law tools (and the Judilibre ones). */
/** Longest title a case-law answer gives; a longer one is cut. */
export const DECISION_TITLE_MAX = 300;

export const decisionTitleSchema = z
  .string()
  .describe('Title of the decision as the source states it; cut to 300 characters.');

export const decisionIdSchema = z.string().describe('Légifrance id of the decision.');

export const decidedSchema = dateSchema
  .nullable()
  .describe('Date of the decision; null when not given.');

export const numbersSchema = z
  .array(z.string())
  .describe('Decision numbers as the source writes them (several for joined decisions).');

export const courtSchema = z
  .string()
  .nullable()
  .describe('The court or authority, as the source names it; null when not given.');

export const chamberSchema = z
  .string()
  .nullable()
  .describe('Chamber or formation, as the source labels it; null when not given.');

export const solutionSchema = z
  .string()
  .nullable()
  .describe('Outcome of the decision as the source records it; null when not given.');

export const decisionPublicationSchema = z
  .string()
  .nullable()
  .describe('How the source records the decision as published; null when not given.');

export const ecliSchema = z
  .string()
  .nullable()
  .describe('ECLI of the decision; null when not given.');

/** Fields of the Judilibre tools (shared by `judilibre_search_decisions` and `judilibre_get_decision`). */
export const judilibreIdSchema = z.string().describe('Judilibre id of the decision.');

export const judilibreLinkSchema = z
  .string()
  .describe('Official page of the decision on courdecassation.fr.');

export const judilibreJurisdictionSchema = z
  .string()
  .describe(
    "Judilibre's key for the jurisdiction: cc Cour de cassation, ca court of appeal, tj tribunal judiciaire, tcom commercial court, cph labour court.",
  );

export const locationSchema = z
  .string()
  .nullable()
  .describe('The court within its jurisdiction, as Judilibre labels it; null when not given.');

export const formationSchema = z
  .string()
  .nullable()
  .describe('Formation of the Cour de cassation, as Judilibre labels it; null when not given.');

export const publicationListSchema = z
  .array(z.string())
  .describe(
    'How the Cour de cassation published the decision, as Judilibre labels it; empty when it is not published in the Bulletin.',
  );

export const changeActionSchema = z
  .enum(['created', 'amended', 'repealed', 'codified', 'transferred', 'linked'])
  .describe('What the change did to the article.');

const CHANGE_ACTIONS: Readonly<Record<HistoryEntry['action'], z.infer<typeof changeActionSchema>>> =
  {
    creation: 'created',
    modification: 'amended',
    abrogation: 'repealed',
    codification: 'codified',
    transfer: 'transferred',
    other: 'linked',
  };

/** The answer's word for what a history or change-log entry did. */
export function changeActionOf(action: HistoryEntry['action']): z.infer<typeof changeActionSchema> {
  return CHANGE_ACTIONS[action];
}

/** One section of a text or code: the titles down to it, and its Légifrance id. */
export const sectionSchema = z.object({
  path: z.array(z.string()).describe('Titles from the outermost section down to this one.'),
  section_id: z.string().describe('Légifrance id of the section.'),
});

export const pageSchema = z
  .object({ number: z.number().int(), of: z.number().int() })
  .describe('This page and the number of pages.');

export const partSchema = z
  .object({ from: z.number().int(), to: z.number().int(), of: z.number().int() })
  .describe('The characters of the text shown: from, to, and the text length.');

export const nextSchema = z
  .union([z.object({ page: z.number().int() }), z.object({ offset: z.number().int() })])
  .nullable()
  .describe('The page or character offset where the rest starts; null when nothing is left.');

export const orderSchema = z
  .enum(['most_relevant_first', 'newest_first', 'oldest_first'])
  .describe('The order of the list.');

export const pointerSchema = z
  .object({ tool: z.string() })
  .catchall(z.union([z.string(), z.number(), z.boolean()]))
  .describe('A tool name and its arguments.');

export const cachedSchema = z
  .object({ what: z.string(), retrieved: z.string() })
  .describe('Content served from an in-memory cache, and when it was fetched (UTC).');

/**
 * The schema of one kind of answer (`outcome`) from `source`: the envelope around `shape`, in
 * the order answers are written (envelope head, the tool's fields in `shape` order, envelope tail).
 */
export function answerSchema<O extends string, Sh extends z.core.$ZodShape>(
  source: SourceName,
  outcome: O,
  shape: Sh,
) {
  return z.object({
    source: z.literal(source).describe('The source the answer comes from.'),
    outcome: z.literal(outcome).describe('The kind of answer.'),
    warnings: z.array(z.string()).describe('Sentences about the answer that no field carries.'),
    ...shape,
    request: pointerSchema.describe('The call, with defaults applied.'),
    retrieved: z.string().describe('When the answer was put together (UTC).'),
    cached: z.array(cachedSchema).describe('Content served from an in-memory cache.'),
    vigueur_version: z.string().describe('The Vigueur version that answered.'),
  });
}

/** An answer as a tool builds it: `toolAnswer` adds `retrieved` and `vigueur_version`. */
export type AnswerBody<T> = T extends unknown ? Omit<T, 'retrieved' | 'vigueur_version'> : never;

/**
 * The result of a successful call: `body` with `retrieved` (from `ctx.now`) and
 * `vigueur_version`, parsed by `schema` (key order fixed, unknown keys dropped; throws on a
 * mismatch), as `structuredContent` and as its JSON text.
 */
export function toolAnswer<S extends z.ZodType>(
  schema: S,
  body: AnswerBody<z.input<S>>,
  ctx: Pick<ToolContext, 'now'>,
): CallToolResult {
  const answer = schema.parse({
    ...body,
    retrieved: isoSecond(ctx.now()),
    vigueur_version: VERSION,
  }) as Record<string, unknown>;
  return { content: [{ type: 'text', text: JSON.stringify(answer) }], structuredContent: answer };
}

/**
 * A call's `request`: `tool`, then each parameter of `input` in its order with the value used,
 * the argument given or else its default. A string argument is trimmed and a blank one counts as
 * absent; a parameter with neither value nor default is left out.
 */
export function requestEcho(
  tool: string,
  input: z.ZodObject | undefined,
  args: Record<string, unknown>,
  defaults: Record<string, string | number | boolean>,
): Pointer {
  const echo: Pointer = { tool };
  for (const key of Object.keys(input?.shape ?? {})) {
    const arg = args[key];
    const given = typeof arg === 'string' ? presentOrUndefined(arg) : arg;
    const value = (given as string | number | boolean | undefined) ?? defaults[key];
    if (value !== undefined) echo[key] = value;
  }
  return echo;
}

const STATES: Readonly<Record<StatusAt['reason'], StatusValue['state']>> = {
  in_force: 'in_force',
  ended: 'not_in_force',
  not_yet_in_force: 'not_yet_in_force',
  never_applied: 'never_applied',
};

/** The `status` of a version on `on`; `untilUndetermined`: an end is recorded without a date. */
export function statusValue(s: StatusAt, on: IsoDate, untilUndetermined = false): StatusValue {
  return {
    state: STATES[s.reason],
    on,
    from: s.from,
    until: s.until,
    until_undetermined: untilUndetermined,
  };
}

/** `d` in UTC to the second: `YYYY-MM-DDTHH:MM:SSZ`. */
export function isoSecond(d: Date): string {
  return `${d.toISOString().slice(0, 19)}Z`;
}
