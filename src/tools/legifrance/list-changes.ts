import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import type { IsoDate } from '../../domain/dates.js';
import { codeUrl, jorfUrl, lodaUrl } from '../../domain/links.js';
import type { ChangesView } from '../../services/legislation/changes.js';
import type { CallContext, ChangeEntry } from '../../services/legislation/ports.js';
import {
  type AnswerBody,
  answerSchema,
  changeActionOf,
  changeActionSchema,
  dateSchema,
  legifranceLinkSchema,
  nextSchema,
  type Pointer,
  pageSchema,
  requestEcho,
  type ToolContext,
  toolAnswer,
} from '../envelope.js';
import {
  callSignal,
  isoDateSchema,
  jsonCost,
  listPage,
  optionalIsoDateSchema,
  presentOrUndefined,
  roomAfter,
  WIDE_PAGE,
} from '../format.js';
import { toolError } from '../tool-error.js';

const TOOL = 'legifrance_list_changes';
const SOURCE = 'Légifrance';

export type ListChanges = (
  input: { code?: string; text?: string; since: IsoDate; until?: IsoDate },
  ctx?: CallContext,
) => Promise<ChangesView>;

const DESCRIPTION =
  'List what changed in a French code, or in a law or decree, between two dates on Légifrance — articles created, amended, repealed, renumbered — grouped by the amending text. Give either "code" (e.g. "Code du travail") or "text" (a law or decree: "loi 78-17", a NOR or a Légifrance id). Dates are entry-into-force dates (not publication dates). Example: what changed in the Code du travail since 2026-01-01.';

const inputSchema = z.object({
  code: z
    .string()
    .optional()
    .describe('Code title, e.g. "Code du travail", "Code civil". Exclusive with "text".'),
  text: z
    .string()
    .optional()
    .describe(
      'A law, ordinance, decree or order: "loi 78-17", "décret 2019-1088", a NOR, or a LEGITEXT/JORFTEXT id. Exclusive with "code".',
    ),
  since: isoDateSchema.describe('Start of the range, YYYY-MM-DD (entry-into-force date).'),
  until: optionalIsoDateSchema.describe('End of the range, YYYY-MM-DD. Default: today.'),
  page: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      'Page of the change list (default 1): at most 100 entries, fewer when the entries are long; the answer gives the next page.',
    ),
});

const ENTRIES_PER_PAGE = 100;
const DEFAULT_PAGE = 1;

// ---------------------------------------------------------------------------------------------
// Output schema

const entrySchema = z.object({
  date: dateSchema.describe('Entry-into-force date of the change, not its publication date.'),
  action: changeActionSchema,
  article: z.string().nullable().describe('Article number; null when not given.'),
  section: z
    .string()
    .nullable()
    .describe('Title of the section holding the article; null when not given.'),
  article_id: z.string().nullable().describe('Légifrance id of the article; null when not given.'),
  amending_article_id: z
    .string()
    .nullable()
    .describe('Légifrance id of the amending article; null when not given.'),
  scheduled: z.boolean().describe('The date is after today.'),
});

const groupSchema = z.object({
  amended_by: z.string().describe('Title of the amending text.'),
  entries: z.array(entrySchema).describe('The changes this text made, as listed on this page.'),
});

const changesShape = {
  target: z.enum(['code', 'text']).describe('What changed: a code, or a law or decree.'),
  title: z.string().describe('Title of the code or text.'),
  id: z.string().describe('Légifrance id of the code or text.'),
  link: legifranceLinkSchema,
  since: dateSchema.describe('Start of the range (entry-into-force date).'),
  until: dateSchema.describe('End of the range (entry-into-force date).'),
  results: z.number().int().describe('Number of entries over all pages.'),
  amending_texts: z.number().int().describe('Number of amending texts over all pages.'),
  scheduled: z.number().int().describe('Entries dated after today.'),
  undetermined_versions: z
    .number()
    .int()
    .describe(
      'Versions in the range whose entry-into-force date Légifrance leaves undetermined; not listed.',
    ),
  page: pageSchema,
  next: nextSchema,
  items: z
    .array(groupSchema)
    .describe(
      'The entries of this page, by amending text; a text continuing from the previous page is repeated.',
    ),
};

const resultsBranch = answerSchema(SOURCE, 'results', changesShape);
const noResultsBranch = answerSchema(SOURCE, 'no_results', changesShape);

export const listChangesOutput = z.discriminatedUnion('outcome', [resultsBranch, noResultsBranch]);

// ---------------------------------------------------------------------------------------------
// Answer builder

export type ListChangesAnswer = AnswerBody<z.input<typeof listChangesOutput>>;
type ChangesAnswer = AnswerBody<z.input<typeof resultsBranch | typeof noResultsBranch>>;
type Group = ChangesAnswer['items'][number];
type Entry = Group['entries'][number];

export interface ChangesAnswerOptions {
  /** The call's `request` (`requestEcho`). */
  request: Pointer;
  /** Entries dated after it are scheduled. */
  today: IsoDate;
  page: number;
}

/** `target` follows the input: a code → its code page; a text → LODA for a LEGITEXT id, JORF for a JORFTEXT id. */
function linkOf(view: ChangesView): string {
  if (view.target === 'code') return codeUrl(view.textId);
  return view.textId.startsWith('JORFTEXT') ? jorfUrl(view.textId) : lodaUrl(view.textId);
}

function entryOf(e: ChangeEntry, today: IsoDate): Entry {
  return {
    date: e.date,
    action: changeActionOf(e.action),
    article: e.articleNum,
    section: e.sectionTitle,
    article_id: e.articleId,
    amending_article_id: e.amendingArticleId,
    scheduled: e.date > today,
  };
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

function warningsOf(view: ChangesView): string[] {
  const n = view.undeterminedCount;
  const years = view.detailMissingYears;
  return [
    ...(n > 0
      ? [
          `${n} ${plural(n, 'version', 'versions')} in this range ${plural(n, 'has', 'have')} an entry-into-force date Légifrance leaves undetermined and ${plural(n, 'is', 'are')} not listed.`,
        ]
      : []),
    ...(years.length > 0
      ? [
          `Légifrance has not loaded the version detail for ${years.join(', ')}: changes of ${plural(years.length, 'that year', 'those years')} may be missing.`,
        ]
      : []),
  ];
}

/**
 * One page of a change log, 100 entries at most (fewer when the answer would pass
 * `MAX_TOOL_TEXT`). Only the entries are paged, by amending text; a group continuing from the
 * previous page repeats its `amended_by`. A page without entries (an empty range, or past the
 * last page) is `no_results`.
 */
export function buildListChangesAnswer(
  view: ChangesView,
  opts: ChangesAnswerOptions,
): ListChangesAnswer {
  const flat = view.groups.flatMap((g, group) => g.entries.map((entry) => ({ group, entry })));
  const answer = (
    outcome: 'results' | 'no_results',
    items: Group[],
    pageCount: number,
    hasMore: boolean,
    shown: number = opts.page,
  ): ChangesAnswer => ({
    source: SOURCE,
    outcome,
    warnings: warningsOf(view),
    target: view.target,
    title: view.textTitle,
    id: view.textId,
    link: linkOf(view),
    since: view.since,
    until: view.until,
    results: view.totalEntries,
    amending_texts: view.groups.length,
    scheduled: view.scheduledCount,
    undetermined_versions: view.undeterminedCount,
    page: { number: shown, of: pageCount },
    next: hasMore ? { page: shown + 1 } : null,
    items,
    request: opts.request,
    cached: [],
  });

  // The frame is measured with the widest page numbers, whatever page is asked, so pages split alike.
  const frame = JSON.stringify({
    ...answer('results', [], WIDE_PAGE, true, WIDE_PAGE),
    request: { ...opts.request, page: WIDE_PAGE },
  });
  const paged = listPage(
    flat,
    opts.page,
    // A group's amending text is charged where the group starts on the page.
    (i, previous) =>
      jsonCost(entryOf(i.entry, opts.today)) +
      (previous?.group === i.group
        ? 0
        : JSON.stringify(view.groups[i.group]?.amendingTitle).length + 40),
    { maxItems: ENTRIES_PER_PAGE, budget: roomAfter(frame) },
  );

  const items: Group[] = [];
  let last: number | undefined;
  for (const { group, entry } of paged.items) {
    const e = entryOf(entry, opts.today);
    const current = items.at(-1);
    if (last === group && current !== undefined) current.entries.push(e);
    else items.push({ amended_by: view.groups[group]?.amendingTitle ?? '', entries: [e] });
    last = group;
  }
  return answer(
    items.length === 0 ? 'no_results' : 'results',
    items,
    paged.pageCount,
    paged.hasMore,
  );
}

export function registerListChangesTool(
  server: McpServer,
  listChanges: ListChanges,
  ctx: ToolContext,
): void {
  server.registerTool(
    TOOL,
    {
      title: 'List changes to a French code, law or decree',
      description: DESCRIPTION,
      inputSchema,
      outputSchema: listChangesOutput,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args, extra) => {
      const request = requestEcho(TOOL, inputSchema, args, {
        until: ctx.today(),
        page: DEFAULT_PAGE,
      });
      const signal = callSignal(extra.mcpReq.signal, ctx.deadlineMs);
      try {
        const view = await listChanges(
          {
            code: presentOrUndefined(args.code),
            text: presentOrUndefined(args.text),
            since: args.since,
            until: presentOrUndefined(args.until),
          },
          { signal },
        );
        const body = buildListChangesAnswer(view, {
          request,
          today: ctx.today(),
          page: args.page ?? DEFAULT_PAGE,
        });
        return toolAnswer(listChangesOutput, body, ctx);
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
