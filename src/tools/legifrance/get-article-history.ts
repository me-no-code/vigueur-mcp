import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import type { IsoDate } from '../../domain/dates.js';
import { articleUrlFor } from '../../domain/links.js';
import type { ArticleRef } from '../../domain/relocation.js';
import type {
  ArticleHistoryResult,
  ArticleHistoryView,
  GetArticleHistoryInput,
} from '../../services/legislation/history.js';
import type { CallContext, HistoryEntry } from '../../services/legislation/ports.js';
import {
  type AnswerBody,
  answerSchema,
  changeActionOf,
  changeActionSchema,
  dateSchema,
  fromSchema,
  legifranceStatusSchema,
  nextSchema,
  type Pointer,
  pageSchema,
  requestEcho,
  type ToolContext,
  toolAnswer,
  untilSchema,
  untilUndeterminedSchema,
} from '../envelope.js';
import {
  callSignal,
  jsonCost,
  listPage,
  presentOrUndefined,
  responseFormatSchema,
  roomAfter,
  WIDE_PAGE,
} from '../format.js';
import { toolError } from '../tool-error.js';
import { buildLookupMiss } from './get-article-answer.js';
import { lookupMissBranches } from './get-article-output.js';

export type GetArticleHistory = (
  input: GetArticleHistoryInput,
  ctx?: CallContext,
) => Promise<ArticleHistoryResult>;

const TOOL = 'legifrance_get_article_history';
const SOURCE = 'Légifrance';

const DESCRIPTION =
  'List every version of a French code article on Légifrance with its validity dates, status, and the texts that created, amended or repealed it (e.g. "Ordonnance n°2016-131 du 10 février 2016 - art. 4"), plus Légifrance\'s concordance links showing where content moved when articles were renumbered. Use it to explain how an article evolved or to find the version that applied on a date. It takes no date: to read the text in force on a date, use legifrance_get_article with at_date.';

const inputSchema = z.object({
  code: z
    .string()
    .optional()
    .describe('Code title, e.g. "Code civil", "Code du travail". Omit to look in every code.'),
  number: z
    .string()
    .optional()
    .describe('Article number as cited, e.g. "1240", "L1234-1", "L. 1234-1".'),
  id: z
    .string()
    .optional()
    .describe(
      'Légifrance article id, instead of code + number: LEGIARTI + 12 digits (code or law article) or KALIARTI + 12 digits (collective agreement article).',
    ),
  page: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Page of the events list (default 1); the answer says when there is a next page.'),
  response_format: responseFormatSchema
    .optional()
    .describe('"concise" (default) or "detailed" (also the id of each amending article).'),
});

/** Events per page, at most; fewer when the answer would pass `MAX_TOOL_TEXT`. */
const EVENTS_PER_PAGE = 100;

// ---------------------------------------------------------------------------------------------
// Output schema

const currentSchema = z
  .object({
    id: z.string().describe('Légifrance id of the version.'),
    version: z.string().describe("Légifrance's version number."),
    from: fromSchema,
    until: untilSchema,
    until_undetermined: untilUndeterminedSchema,
  })
  .nullable()
  .describe('The version whose validity dates cover `on`; null when none does.');

const versionSchema = z.object({
  id: z.string().describe('Légifrance id of the version.'),
  version: z.string().describe("Légifrance's version number."),
  legifrance_status: legifranceStatusSchema,
  from: fromSchema,
  until: untilSchema,
  until_undetermined: untilUndeterminedSchema,
});

const eventSchema = z.object({
  date: dateSchema
    .nullable()
    .describe('Entry-into-force date of the change; null when Légifrance has not determined it.'),
  date_undetermined: z.boolean().describe('Légifrance records the date as not determined.'),
  action: changeActionSchema,
  by: z.string().describe('Title of the amending text.'),
  by_article_id: z
    .string()
    .nullable()
    .describe('Légifrance id of the amending article; null in a concise answer or when not given.'),
  scheduled: z.boolean().describe('The date is after `on`.'),
});

const historyShape = {
  code: z.string().nullable().describe('Title of the code; null when Légifrance gives none.'),
  number: z.string().describe('Article number.'),
  link: z
    .string()
    .nullable()
    .describe(
      'Official page of the version in force on `on`, else of the latest version; null when there is no version.',
    ),
  on: dateSchema.describe('Today: the date `current` and `scheduled` are computed for.'),
  current: currentSchema,
  versions: z
    .array(versionSchema)
    .describe('Every version of the article, by start date (unknown starts last).'),
  results: z.number().int().describe('Number of events over all pages.'),
  page: pageSchema,
  next: nextSchema,
  items: z
    .array(eventSchema)
    .describe('The events of this page: texts that created, amended or repealed the article.'),
  concordance: z
    .object({
      moved: z
        .array(
          z.object({
            version: z.string().describe("Légifrance's number of the version whose content moved."),
            from: fromSchema,
            until: untilSchema,
            to: z.array(z.string()).describe('The articles where that content now is.'),
          }),
        )
        .describe(
          'Where the content of the first and of the current (else latest) version moved, per Légifrance concordance.',
        ),
      came_from: z
        .array(z.string())
        .describe(
          'Articles whose content is now at this article number, per Légifrance concordance.',
        ),
    })
    .describe("Légifrance's concordance links."),
};

const foundBranch = answerSchema(SOURCE, 'found', historyShape);
const noResultsBranch = answerSchema(SOURCE, 'no_results', historyShape);

export const getArticleHistoryOutput = z.discriminatedUnion('outcome', [
  foundBranch,
  noResultsBranch,
  ...lookupMissBranches,
]);

// ---------------------------------------------------------------------------------------------
// Answer builder

export type GetArticleHistoryAnswer = AnswerBody<z.input<typeof getArticleHistoryOutput>>;
type HistoryAnswer = AnswerBody<z.input<typeof foundBranch | typeof noResultsBranch>>;
type HistoryItem = HistoryAnswer['items'][number];

export interface HistoryAnswerOptions {
  /** The call's `request` (`requestEcho`). */
  request: Pointer;
  detailed: boolean;
  /** The date `current` and `scheduled` are computed for. */
  today: IsoDate;
  /** The id asked for, echoed when no article has it. */
  requestedId: string | null;
  page: number;
}

const labels = (refs: readonly ArticleRef[]) => refs.map((r) => r.label);

function eventItem(e: HistoryEntry, opts: HistoryAnswerOptions): HistoryItem {
  return {
    date: e.date,
    date_undetermined: e.undetermined,
    action: changeActionOf(e.action),
    by: e.amendingTitle,
    by_article_id: opts.detailed ? e.amendingArticleId : null,
    scheduled: e.date !== null && e.date > opts.today,
  };
}

/**
 * One page of an article history. Only the events are paged; every page carries the versions,
 * the concordance and the link. A page past the last one is `no_results` with no events.
 */
function historyAnswer(view: ArticleHistoryView, opts: HistoryAnswerOptions): HistoryAnswer {
  const { current } = view;
  const linked = current ?? view.versions.at(-1);
  const items = view.events.map((e) => eventItem(e, opts));
  const page = (
    outcome: 'found' | 'no_results',
    pageItems: HistoryItem[],
    pageCount: number,
    hasMore: boolean,
    shown: number = opts.page,
  ): HistoryAnswer => ({
    source: SOURCE,
    outcome,
    warnings: view.warnings,
    code: view.codeTitle,
    number: view.num,
    link: linked === undefined ? null : articleUrlFor(linked.id),
    on: opts.today,
    current:
      current === null
        ? null
        : {
            id: current.id,
            version: current.version,
            from: current.validFrom,
            until: current.validTo,
            until_undetermined: current.validToUndetermined,
          },
    versions: view.versions.map((v) => ({
      id: v.id,
      version: v.version,
      legifrance_status: v.rawStatus || null,
      from: v.validFrom,
      until: v.validTo,
      until_undetermined: v.validToUndetermined,
    })),
    results: items.length,
    page: { number: shown, of: pageCount },
    next: hasMore ? { page: shown + 1 } : null,
    items: pageItems,
    concordance: {
      moved: view.concordance.moved.map(({ version: v, to }) => ({
        version: v.version,
        from: v.validFrom,
        until: v.validTo,
        to: labels(to),
      })),
      came_from: labels(view.concordance.from),
    },
    request: opts.request,
    cached: [],
  });

  // The frame is measured with the widest page numbers, whatever page is asked, so pages split alike.
  const frame = JSON.stringify({
    ...page('found', [], WIDE_PAGE, true, WIDE_PAGE),
    request: { ...opts.request, page: WIDE_PAGE },
  });
  const paged = listPage(items, opts.page, (item) => jsonCost(item), {
    maxItems: EVENTS_PER_PAGE,
    budget: roomAfter(frame),
  });
  return page(paged.pastEnd ? 'no_results' : 'found', paged.items, paged.pageCount, paged.hasMore);
}

/** The answer body: one page of the history, or the shared answer for a bad citation. */
export function buildGetArticleHistoryAnswer(
  result: ArticleHistoryResult,
  opts: HistoryAnswerOptions,
): GetArticleHistoryAnswer {
  return result.kind === 'history' ? historyAnswer(result, opts) : buildLookupMiss(result, opts);
}

export function registerGetArticleHistoryTool(
  server: McpServer,
  getArticleHistory: GetArticleHistory,
  ctx: ToolContext,
): void {
  server.registerTool(
    TOOL,
    {
      title: 'Get the history of a French code article',
      description: DESCRIPTION,
      inputSchema,
      outputSchema: getArticleHistoryOutput,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args, extra) => {
      const request = requestEcho(TOOL, inputSchema, args, {
        page: 1,
        response_format: 'concise',
      });
      const signal = callSignal(extra.mcpReq.signal, ctx.deadlineMs);
      try {
        const id = presentOrUndefined(args.id);
        const result = await getArticleHistory(
          { code: presentOrUndefined(args.code), number: presentOrUndefined(args.number), id },
          { signal },
        );
        const body = buildGetArticleHistoryAnswer(result, {
          request,
          detailed: args.response_format === 'detailed',
          today: ctx.today(),
          requestedId: id ?? null,
          page: args.page ?? 1,
        });
        return toolAnswer(getArticleHistoryOutput, body, ctx);
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
