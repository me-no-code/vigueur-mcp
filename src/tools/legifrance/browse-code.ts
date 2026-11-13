import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { codeSectionUrl, codeUrl } from '../../domain/links.js';
import type { StatusAt } from '../../domain/status-at.js';
import type { BrowseInput, BrowseView } from '../../services/legislation/browse.js';
import type { CallContext } from '../../services/legislation/ports.js';
import {
  callSignal,
  MAX_TOOL_TEXT,
  nextPageHint,
  optionalIsoDateSchema,
  pageByBudget,
  presentOrUndefined,
} from '../format.js';
import { toToolError } from '../tool-error.js';

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

export interface BrowseRenderOptions {
  /** 1-based page of the node's sections and articles. */
  page: number;
}

/** Room kept below the cap for rounding (separators, page numbers). */
const SAFETY = 200;
const MAX_ITEMS = 1_000;

const HINT =
  'Pass a section_id to list what it contains; read an article with legifrance_get_article and its id.';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Why a section listed with include_repealed does not apply on the date, from its dates. */
function notInForcePhrase(force: StatusAt): string | null {
  switch (force.reason) {
    case 'in_force':
      return null;
    case 'ended':
      return `no longer in force — ended ${force.until}`;
    case 'not_yet_in_force':
      return `not yet in force — from ${force.from}`;
    case 'never_applied':
      return 'never in force (still-born)';
  }
}

/**
 * One level of a code's table of contents: the node's own sections and articles, one line each.
 * `view.children` are subtrees of the client's cached table, shared by reference: they are only
 * read here (titles and ids of this level), never sorted, cut or written to.
 */
export function renderBrowseCode(view: BrowseView, opts: BrowseRenderOptions): string {
  const header = [`### ${view.codeTitle} — table of contents on ${view.asOf}`];
  if (view.node !== null) {
    const path = [view.codeTitle, ...view.breadcrumb.map((b) => b.title)].join(' › ');
    header.push(`${path} · section_id ${view.node.cid}`);
  }
  // The table gives articles no dates: their label is today's, so on another date it is
  // reported as such, never as the article's status on that date.
  const labelsOfToday = !view.asOfIsToday;
  if (labelsOfToday && view.articles.length > 0) {
    header.push(
      `Article labels are Légifrance's current ones; open an article with legifrance_get_article and at_date to check it on ${view.asOf}.`,
    );
  }
  const items = [
    ...view.children.map(({ section, force }) => {
      const phrase = notInForcePhrase(force);
      return `- ${section.title}${phrase === null ? '' : ` · ${phrase}`} · section_id ${section.cid}`;
    }),
    ...view.articles.map((a) => {
      const label = a.rawStatus || a.status;
      return labelsOfToday
        ? `- art. ${a.num ?? '?'} (Légifrance label today: ${label}) · id ${a.id}`
        : `- art. ${a.num ?? '?'} · ${label} · id ${a.id}`;
    }),
  ];
  const n = view.hiddenNotInForce;
  const hidden =
    n > 0
      ? `(${plural(n, 'item')} not in force on ${view.asOf} hidden — include_repealed: true to show them)`
      : null;
  const source = `Source: ${view.node === null ? codeUrl(view.codeId) : codeSectionUrl(view.codeId, view.node.cid)}`;

  const assemble = (pageNote: string | null, list: string, next: string | null) =>
    [
      header.join('\n'),
      ...(pageNote === null ? [] : [pageNote]),
      list,
      ...(hidden === null ? [] : [hidden]),
      ...(next === null ? [] : [next]),
      HINT,
      source,
    ].join('\n\n');

  const counts = `${plural(view.children.length, 'section')}, ${plural(view.articles.length, 'article')}`;
  const frame = assemble(`${counts} — page 99999 of 99999`, '', nextPageHint(99999)).length;
  const paged = pageByBudget(items, opts.page, (line) => line.length + 1, {
    maxItems: MAX_ITEMS,
    budget: MAX_TOOL_TEXT - frame - SAFETY,
  });
  return assemble(
    paged.pageCount > 1 ? `${counts} — page ${opts.page} of ${paged.pageCount}` : null,
    // Date-valid sections are never hidden and, on a date other than today, no article is: an
    // empty list means nothing here is in force on the date.
    items.length === 0 ? `Nothing in force here on ${view.asOf}.` : paged.items.join('\n'),
    paged.hasMore ? nextPageHint(opts.page) : null,
  );
}

export function registerBrowseCodeTool(
  server: McpServer,
  browseCode: BrowseCode,
  deadlineMs?: number,
): void {
  server.registerTool(
    'legifrance_browse_code',
    {
      title: "Browse a French code's table of contents",
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
      const signal = callSignal(ctx.mcpReq.signal, deadlineMs);
      try {
        const input: BrowseInput = {
          code: args.code.trim(),
          sectionCid: presentOrUndefined(args.section_id),
          atDate: presentOrUndefined(args.at_date),
          includeRepealed: args.include_repealed,
        };
        const view = await browseCode(input, { signal });
        const text = renderBrowseCode(view, { page: args.page ?? 1 });
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        return toToolError(err, signal);
      }
    },
  );
}
