import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { joIssueUrl, jorfUrl, LEGIFRANCE_BASE_URL } from '../../domain/links.js';
import type { LatestJoInput, LatestJoView } from '../../services/legislation/jo.js';
import type { CallContext, JoIssue, JoText } from '../../services/legislation/ports.js';
import {
  callSignal,
  MAX_TOOL_TEXT,
  nextPageHint,
  optionalIsoDateSchema,
  pageByBudget,
  presentOrUndefined,
} from '../format.js';
import { toToolError } from '../tool-error.js';

export type LatestJo = (input: LatestJoInput, ctx?: CallContext) => Promise<LatestJoView>;

const DESCRIPTION =
  'Read the latest issues of the Journal officiel (JORF) from Légifrance, or the issue(s) published on a given date, with their table of contents: each published text with its nature (loi, décret, arrêté…), ministry and a link. Filter by nature and/or emitter (ministry or authority, partial names accepted). Dates are publication dates.';

const inputSchema = z.object({
  count: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .describe('How many of the latest issues to read, 1 to 10 (default 1). Ignored with "date".'),
  date: optionalIsoDateSchema.describe(
    'Read the issue(s) published on this date, YYYY-MM-DD (publication date).',
  ),
  nature: z
    .string()
    .optional()
    .describe(
      'Keep only texts of this nature, e.g. "decret", "arrete", "loi". See legifrance_list_reference_values.',
    ),
  emitter: z
    .string()
    .optional()
    .describe(
      'Keep only texts of this ministry or authority; a partial name is enough, e.g. "travail".',
    ),
  page: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Page of the table of contents (default 1), as given in the answer.'),
});

const MAX_ITEMS = 1_000;
const BUDGET = MAX_TOOL_TEXT - 6_000;
const LISTED_VALUES = 10;

type Item =
  | { kind: 'issue'; issue: JoIssue }
  | { kind: 'text'; issue: JoIssue; group: number; path: string[]; text: JoText };

const textLine = (t: JoText): string =>
  `- ${t.title} · ${t.nature ?? 'nature n/a'} · ${t.ministry ?? t.emitter ?? 'emitter n/a'} · ${jorfUrl(t.id)}`;

const issueHeader = (issue: JoIssue): string =>
  [
    `### ${issue.title}`,
    `Published ${issue.publishedOn ?? 'date n/a'}${issue.eliPath === null ? '' : ` · ${joIssueUrl(issue.eliPath)}`}`,
  ].join('\n');

const pathCost = (path: string[]) => path.join(' › ').length + 8;

function listed(values: readonly string[]): string {
  const shown = values.slice(0, LISTED_VALUES).join('; ');
  return values.length > LISTED_VALUES
    ? `${shown}; … (${values.length - LISTED_VALUES} more)`
    : shown;
}

/** One page of Journal officiel issues: titles, publication dates and the texts, 40 000 chars at most. */
export function renderLatestJo(view: LatestJoView, opts: { page: number }): string {
  const items: Item[] = [];
  for (const issue of view.issues) {
    items.push({ kind: 'issue', issue });
    (issue.groups ?? []).forEach((g, group) => {
      for (const text of g.texts) items.push({ kind: 'text', issue, group, path: g.path, text });
    });
  }
  const paged = pageByBudget(
    items,
    opts.page,
    (i) =>
      i.kind === 'issue'
        ? issueHeader(i.issue).length + 2
        : textLine(i.text).length + 1 + pathCost(i.path) + issueHeader(i.issue).length,
    { maxItems: MAX_ITEMS, budget: BUDGET },
  );

  const { nature, emitter, matchedEmitters } = view.filter;
  const filters = [
    nature === null ? null : `nature "${nature}"`,
    emitter === null ? null : `emitter "${emitter}"`,
  ].filter((f) => f !== null);
  const filterLine =
    filters.length === 0
      ? null
      : `Filters: ${filters.join(', ')}.${
          emitter !== null && matchedEmitters.length > 0
            ? ` Matched emitters: ${listed(matchedEmitters)}.`
            : ''
        }`;
  const n = view.issues.length;
  const header = [
    `## Journal officiel — ${n} ${n === 1 ? 'issue' : 'issues'}, ${view.totalTexts} ${view.totalTexts === 1 ? 'text' : 'texts'}${filterLine === null ? '' : ' matching'} — page ${opts.page} of ${paged.pageCount}. Dates are publication dates.`,
    ...(filterLine === null ? [] : [filterLine]),
  ];

  const blocks: string[] = [];
  let issueId: string | null = null;
  let groupKey: number | null = null;
  const pageIssues: JoIssue[] = [];
  for (const item of paged.items) {
    if (item.kind === 'issue') {
      blocks.push(issueHeader(item.issue));
      issueId = item.issue.id;
      groupKey = null;
      pageIssues.push(item.issue);
      if (item.issue.groups === null)
        blocks.push('Table of contents not available for this issue.');
      continue;
    }
    if (issueId !== item.issue.id) {
      // A page starting inside an issue repeats its header.
      blocks.push(issueHeader(item.issue));
      issueId = item.issue.id;
      groupKey = null;
      pageIssues.push(item.issue);
    }
    const line = textLine(item.text);
    const header4 = item.path.length === 0 ? null : `#### ${item.path.join(' › ')}`;
    if (groupKey !== item.group || blocks.length === 0) {
      groupKey = item.group;
      blocks.push(header4 === null ? line : `${header4}\n${line}`);
    } else {
      const last = blocks.length - 1;
      blocks[last] = `${blocks[last]}\n${line}`;
    }
  }

  const tail: string[] = [];
  if (view.totalTexts === 0) {
    if (filterLine !== null) {
      tail.push('No text matches these filters in the selected issue(s).');
      if (view.available.natures.length > 0)
        tail.push(`Natures available in these issues: ${listed(view.available.natures)}.`);
      if (view.available.emitters.length > 0)
        tail.push(`Emitters available in these issues: ${listed(view.available.emitters)}.`);
    } else if (n > 0) {
      tail.push('No text is listed in the selected issue(s).');
    }
  }
  if (n === 0) tail.push('No Journal officiel issue found.');
  if (paged.hasMore) tail.push(nextPageHint(opts.page));
  const sources = pageIssues.flatMap((i) => (i.eliPath === null ? [] : [joIssueUrl(i.eliPath)]));
  const footer = `Source: ${sources.length > 0 ? sources.join(' ; ') : LEGIFRANCE_BASE_URL}`;
  return [...header, ...blocks, ...tail, footer].join('\n\n');
}

export function registerLatestJoTool(
  server: McpServer,
  latestJo: LatestJo,
  deadlineMs?: number,
): void {
  server.registerTool(
    'legifrance_latest_jo',
    {
      title: 'Read the latest Journal officiel',
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
        const view = await latestJo(
          {
            count: args.count,
            date: presentOrUndefined(args.date),
            nature: presentOrUndefined(args.nature),
            emitter: presentOrUndefined(args.emitter),
          },
          { signal },
        );
        return {
          content: [{ type: 'text', text: renderLatestJo(view, { page: args.page ?? 1 }) }],
        };
      } catch (err) {
        return toToolError(err, signal);
      }
    },
  );
}
