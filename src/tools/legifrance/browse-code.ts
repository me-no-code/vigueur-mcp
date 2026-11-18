import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { codeSectionUrl, codeUrl } from '../../domain/links.js';
import type { BrowseInput, BrowseView } from '../../services/legislation/browse.js';
import type { CallContext } from '../../services/legislation/ports.js';
import {
  type AnswerBody,
  answerSchema,
  dateSchema,
  isoSecond,
  legifranceLinkSchema,
  nextSchema,
  type Pointer,
  pageSchema,
  requestEcho,
  sectionSchema,
  statusSchema,
  statusValue,
  type ToolContext,
  toolAnswer,
} from '../envelope.js';
import {
  callSignal,
  jsonCost,
  listPage,
  optionalIsoDateSchema,
  presentOrUndefined,
  roomAfter,
  WIDE_PAGE,
} from '../format.js';
import { toolError } from '../tool-error.js';

const TOOL = 'legifrance_browse_code';
const SOURCE = 'Légifrance';

export type BrowseCode = (input: BrowseInput, ctx?: CallContext) => Promise<BrowseView>;

const DESCRIPTION =
  "Browse the table of contents of a French code on Légifrance (books, titles, chapters, sections, articles) as it stood on a date (default today). Start without section_id to see the top level, then pass a section_id from the answer to go deeper. Sections not in force on the date, judged by their own dates, are hidden unless include_repealed is true. Articles carry only Légifrance's current label: today, repealed articles are hidden unless include_repealed is true; on another date every article is listed with today's label, so check one on that date with legifrance_get_article and at_date. Use legifrance_get_article to read an article listed here.";

const inputSchema = z.object({
  code: z
    .string()
    .describe(
      'Code title, e.g. "Code civil", "Code du travail" (common abbreviations such as "C. trav." work).',
    ),
  section_id: z
    .string()
    .optional()
    .describe(
      'A section_id from an earlier answer, to list what that section contains. Omit for the top level of the code.',
    ),
  at_date: optionalIsoDateSchema.describe(
    'The table of contents in force on this date, YYYY-MM-DD. Default: today.',
  ),
  include_repealed: z
    .boolean()
    .optional()
    .describe(
      'true = also list the sections not in force on the date (each with when it ended or starts) and, today, the repealed articles. Default false.',
    ),
  page: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Page of a long list (default 1), as given in the answer.'),
});

const DEFAULT_PAGE = 1;
const MAX_ITEMS = 1_000;

// ---------------------------------------------------------------------------------------------
// Output schema

const sectionItemSchema = z.object({
  type: z.literal('section'),
  title: z.string().describe('Title of the section.'),
  section_id: z.string().describe('Légifrance id of the section.'),
  status: statusSchema.describe(
    "Whether the section applies on `on`, computed from the section's own dates.",
  ),
});

const articleItemSchema = z.object({
  type: z.literal('article'),
  number: z.string().nullable().describe('Article number; null when not given.'),
  id: z.string().describe('Légifrance id of the article.'),
  legifrance_status_today: z
    .string()
    .describe(
      "Légifrance's own status label of the article today (VIGUEUR, ABROGE…), whatever the date `on`.",
    ),
});

const browseShape = {
  code: z.string().describe('Title of the code.'),
  code_id: z.string().describe('Légifrance id of the code.'),
  on: dateSchema.describe('The date the table of contents is read for.'),
  link: legifranceLinkSchema,
  section: sectionSchema
    .nullable()
    .describe('The section whose contents are listed; null for the top level of the code.'),
  section_count: z.number().int().describe('Sections listed in this level, over all pages.'),
  article_count: z.number().int().describe('Articles listed in this level, over all pages.'),
  results: z.number().int().describe('Sections and articles listed, over all pages.'),
  hidden_not_in_force: z
    .number()
    .int()
    .describe('Sections and articles of this level left out as not in force on `on`.'),
  page: pageSchema,
  next: nextSchema,
  items: z
    .array(z.discriminatedUnion('type', [sectionItemSchema, articleItemSchema]))
    .describe('The sections, then the articles, of this page, in official order.'),
};

const resultsBranch = answerSchema(SOURCE, 'results', browseShape);
const noResultsBranch = answerSchema(SOURCE, 'no_results', browseShape);

export const browseCodeOutput = z.discriminatedUnion('outcome', [resultsBranch, noResultsBranch]);

// ---------------------------------------------------------------------------------------------
// Answer builder

export type BrowseCodeAnswer = AnswerBody<z.input<typeof browseCodeOutput>>;
type Answer = AnswerBody<z.input<typeof resultsBranch | typeof noResultsBranch>>;
type Item = Answer['items'][number];

export interface BrowseAnswerOptions {
  /** The call's `request` (`requestEcho`). */
  request: Pointer;
  page: number;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

const HINT =
  'Pass a section_id to list what it contains; read an article with legifrance_get_article and its id.';

function warningsOf(view: BrowseView): string[] {
  const n = view.hiddenNotInForce;
  return [
    // The table gives articles no dates: their label is today's, so on another date it is
    // reported as such, never as the article's status on that date.
    ...(!view.asOfIsToday && view.articles.length > 0
      ? [
          `Article labels are Légifrance's current ones; open an article with legifrance_get_article and at_date to check it on ${view.asOf}.`,
        ]
      : []),
    ...(n > 0
      ? [
          `(${plural(n, 'item')} not in force on ${view.asOf} hidden — include_repealed: true to show them)`,
        ]
      : []),
    ...(view.children.length + view.articles.length === 0
      ? [`Nothing in force here on ${view.asOf}.`]
      : []),
    HINT,
  ];
}

function itemsOf(view: BrowseView): Item[] {
  return [
    ...view.children.map(
      ({ section, force }): Item => ({
        type: 'section',
        title: section.title,
        section_id: section.cid,
        status: statusValue(force, view.asOf),
      }),
    ),
    ...view.articles.map(
      (a): Item => ({
        type: 'article',
        number: a.num,
        id: a.id,
        legifrance_status_today: a.rawStatus || a.status,
      }),
    ),
  ];
}

/**
 * One page of a code's table of contents at one level: the node's own sections, then its
 * articles. A page without items (nothing in force here, or past the last page) is `no_results`.
 * `view.children` are subtrees of the client's cached table, shared by reference: only read here.
 */
export function buildBrowseCodeAnswer(
  view: BrowseView,
  opts: BrowseAnswerOptions,
): BrowseCodeAnswer {
  const all = itemsOf(view);
  const answer = (
    items: Item[],
    pageCount: number,
    hasMore: boolean,
    shown: number = opts.page,
  ): Answer => ({
    source: SOURCE,
    outcome: items.length === 0 ? 'no_results' : 'results',
    warnings: warningsOf(view),
    code: view.codeTitle,
    code_id: view.codeId,
    on: view.asOf,
    link: view.node === null ? codeUrl(view.codeId) : codeSectionUrl(view.codeId, view.node.cid),
    section:
      view.node === null
        ? null
        : { path: view.breadcrumb.map((b) => b.title), section_id: view.node.cid },
    section_count: view.children.length,
    article_count: view.articles.length,
    results: all.length,
    hidden_not_in_force: view.hiddenNotInForce,
    page: { number: shown, of: pageCount },
    next: hasMore ? { page: shown + 1 } : null,
    items,
    request: opts.request,
    cached: [
      {
        what: `${view.codeTitle} table of contents on ${view.asOf}`,
        retrieved: isoSecond(view.fetchedAt),
      },
    ],
  });

  // The frame is measured with the widest page numbers, whatever page is asked, so pages split alike.
  const frame = JSON.stringify({
    ...answer([], WIDE_PAGE, true, WIDE_PAGE),
    request: { ...opts.request, page: WIDE_PAGE },
  });
  const paged = listPage(all, opts.page, (item) => jsonCost(item), {
    maxItems: MAX_ITEMS,
    budget: roomAfter(frame),
  });
  return answer(paged.items, paged.pageCount, paged.hasMore);
}

export function registerBrowseCodeTool(
  server: McpServer,
  browseCode: BrowseCode,
  ctx: ToolContext,
): void {
  server.registerTool(
    TOOL,
    {
      title: "Browse a French code's table of contents",
      description: DESCRIPTION,
      inputSchema,
      outputSchema: browseCodeOutput,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args, extra) => {
      const request = requestEcho(TOOL, inputSchema, args, {
        at_date: ctx.today(),
        include_repealed: false,
        page: DEFAULT_PAGE,
      });
      const signal = callSignal(extra.mcpReq.signal, ctx.deadlineMs);
      try {
        const input: BrowseInput = {
          code: args.code.trim(),
          sectionCid: presentOrUndefined(args.section_id),
          atDate: presentOrUndefined(args.at_date),
          includeRepealed: args.include_repealed,
        };
        const view = await browseCode(input, { signal });
        const body = buildBrowseCodeAnswer(view, { request, page: args.page ?? DEFAULT_PAGE });
        return toolAnswer(browseCodeOutput, body, ctx);
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
