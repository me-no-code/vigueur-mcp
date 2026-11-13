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
  endCell,
  MAX_TOOL_TEXT,
  nextPageHint,
  pageByBudget,
  presentOrUndefined,
  responseFormatSchema,
  untilPhrase,
} from '../format.js';
import { toToolError } from '../tool-error.js';
import { renderLookupMiss } from './get-article.js';

export type GetArticleHistory = (
  input: GetArticleHistoryInput,
  ctx?: CallContext,
) => Promise<ArticleHistoryResult>;

const DESCRIPTION =
  'List every version of a French code article on Légifrance with its validity dates, status, and the texts that created, amended or repealed it (e.g. "Ordonnance n°2016-131 du 10 février 2016 - art. 4"), plus Légifrance\'s concordance links showing where content moved when articles were renumbered. Use it to explain how an article evolved or to find the version that applied on a date.';

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
    .describe('Légifrance article id (LEGIARTI + 12 digits), instead of code + number.'),
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

/** Events per page, at most; fewer when the text would pass `MAX_TOOL_TEXT`. */
const EVENTS_PER_PAGE = 100;
/** Room kept for everything around the events list. */
const FRAME_RESERVE = 1_500;

const ACTION_LABELS: Readonly<Record<HistoryEntry['action'], string>> = {
  creation: 'created',
  modification: 'amended',
  abrogation: 'repealed',
  codification: 'codified',
  transfer: 'transferred',
  other: 'linked',
};

const refList = (refs: readonly ArticleRef[]) => refs.map((r) => r.label).join('; ');

function versionsTable(view: ArticleHistoryView): string {
  const rows = view.versions.map(
    (v) =>
      `| ${v.version || '?'} | ${v.rawStatus || v.status} | ${v.validFrom ?? 'unknown'} | ${endCell(v)} |`,
  );
  return [
    '#### Versions',
    '| Version | Status | From | Until |',
    '| --- | --- | --- | --- |',
    ...rows,
  ].join('\n');
}

function eventLine(e: HistoryEntry, detailed: boolean, today: IsoDate): string {
  const when = e.date ?? 'date not determined';
  const scheduled = e.date !== null && e.date > today ? ' (scheduled)' : '';
  const via = detailed && e.amendingArticleId !== null ? ` [${e.amendingArticleId}]` : '';
  return `- ${when} — ${ACTION_LABELS[e.action]} by ${e.amendingTitle}${via}${scheduled}`;
}

export interface HistoryRenderOptions {
  detailed: boolean;
  today: IsoDate;
  requestedId: string | null;
  page: number;
}

/**
 * One page of an article history. Only the events list is split; every page repeats the
 * heading, the versions table, the concordance and the source link.
 */
export function renderGetArticleHistory(
  result: ArticleHistoryResult,
  opts: HistoryRenderOptions,
): string {
  if (!('events' in result)) return renderLookupMiss(result, opts);
  const view = result;
  const heading = `### ${view.codeTitle ?? 'Code'} — art. ${view.num || '?'}: version history`;
  const { current } = view;
  const currentLine =
    current === null
      ? 'No version is in force today (computed from validity dates).'
      : `In force today (computed from validity dates): version ${current.version || '?'}, since ${current.validFrom ?? 'an unknown date'}, ${untilPhrase(current.validTo, current.validToUndetermined) ?? 'no end date'}.`;
  // Each line says which content it is about: a move belongs to the version that reported it.
  const num = view.num || '?';
  const concordance = [
    ...view.concordance.moved.map(
      ({ version: v, to }) =>
        `Per Légifrance concordance — content formerly at art. ${num} (${untilPhrase(v.validTo, v.validToUndetermined) ?? `version since ${v.validFrom ?? 'an unknown date'}`}) now at: ${refList(to)}`,
    ),
    ...(view.concordance.from.length > 0
      ? [
          `Per Légifrance concordance — content now at art. ${num} came from: ${refList(view.concordance.from)}`,
        ]
      : []),
  ];
  const linked = view.current ?? view.versions.at(-1);
  const before = [heading, currentLine, ...(view.versions.length > 0 ? [versionsTable(view)] : [])];
  const after = [
    ...(concordance.length > 0 ? [`#### Concordance\n${concordance.join('\n')}`] : []),
    ...(view.warnings.length > 0 ? [view.warnings.map((w) => `⚠️ ${w}`).join('\n')] : []),
    ...(linked === undefined ? [] : [`Source: ${articleUrlFor(linked.id)}`]),
  ];
  const frameLength = [...before, ...after].join('\n\n').length;

  const budget = Math.max(2_000, MAX_TOOL_TEXT - frameLength - FRAME_RESERVE);
  const paged = pageByBudget(
    view.events,
    opts.page,
    (e) => eventLine(e, opts.detailed, opts.today).length + 1,
    { maxItems: EVENTS_PER_PAGE, budget },
  );

  const eventsBlock =
    paged.total === 0
      ? '#### Events\nLégifrance lists no amending text for this article.'
      : [
          `#### Events — entry-into-force dates (${paged.total} in total, page ${opts.page} of ${paged.pageCount})`,
          ...paged.items.map((e) => eventLine(e, opts.detailed, opts.today)),
        ].join('\n');
  const parts = [
    ...before,
    eventsBlock,
    ...after,
    ...(paged.hasMore ? [nextPageHint(opts.page)] : []),
  ];
  return parts.join('\n\n');
}

export function registerGetArticleHistoryTool(
  server: McpServer,
  getArticleHistory: GetArticleHistory,
  today: () => IsoDate,
): void {
  server.registerTool(
    'legifrance_get_article_history',
    {
      title: 'Get the history of a French code article',
      description: DESCRIPTION,
      inputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args, ctx) => {
      try {
        const id = presentOrUndefined(args.id);
        const result = await getArticleHistory(
          { code: presentOrUndefined(args.code), number: presentOrUndefined(args.number), id },
          { signal: ctx.mcpReq.signal },
        );
        const text = renderGetArticleHistory(result, {
          detailed: args.response_format === 'detailed',
          today: today(),
          requestedId: id ?? null,
          page: args.page ?? 1,
        });
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        return toToolError(err);
      }
    },
  );
}
