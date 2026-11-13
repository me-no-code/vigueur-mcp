import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { JURISDICTION_LABELS } from '../../domain/judilibre-labels.js';
import type { TaxonomyResult } from '../../services/case-law/judilibre.js';
import type {
  CallContext,
  JudilibreJurisdiction,
  JudilibreTaxonomyId,
} from '../../services/case-law/ports.js';
import {
  callSignal,
  MAX_TOOL_TEXT,
  nextPageHint,
  pageByBudget,
  presentOrUndefined,
} from '../format.js';
import { toToolError } from '../tool-error.js';

export type ListTaxonomy = (
  input: { list: JudilibreTaxonomyId; jurisdiction?: JudilibreJurisdiction; contains?: string },
  ctx?: CallContext,
) => Promise<TaxonomyResult>;

const DESCRIPTION =
  'List the values Judilibre uses to classify decisions, with their keys: "chamber", "formation", "publication", "solution" (outcomes), "location" (courts of the other jurisdictions), "jurisdiction", "theme" and "field". The keys are what the filters of judilibre_search_decisions take. ' +
  'For the Cour de cassation (jurisdiction cc, the default) the lists are Judilibre\'s own; for courts of appeal and first-instance courts, chambers, formations, publications and outcomes are recorded as free text and there is no list. "contains" filters by label.';

const inputSchema = z.object({
  list: z
    .enum([
      'jurisdiction',
      'chamber',
      'formation',
      'publication',
      'solution',
      'location',
      'theme',
      'field',
    ])
    .describe('Which list to show.'),
  jurisdiction: z
    .enum(['cc', 'ca', 'tj', 'tcom', 'cph'])
    .optional()
    .describe('The jurisdiction the list is for (default cc).'),
  contains: z.string().optional().describe('Keep only values whose label contains these words.'),
  page: z.number().int().min(1).optional().describe('Page of the list (default 1).'),
});

const MAX_ENTRIES = 200;
const SOURCE_LINE = 'Source: Judilibre · https://www.courdecassation.fr';

type Entry = Extract<TaxonomyResult, { kind: 'list' }>['entries'][number];
const entryLine = (e: Entry): string => (e.key === null ? e.label : `${e.key} — ${e.label}`);

/** One page of a list: `{key} — {label}` per line, under `{group}:` headings when the source groups. */
export function renderTaxonomy(result: TaxonomyResult, page: number): string {
  const court = JURISDICTION_LABELS[result.jurisdiction];
  if (result.kind === 'free_text') {
    return [
      `For ${court}, Judilibre records ${result.list}s as free text, so there is no list to filter on: put the words in "query" instead.`,
      SOURCE_LINE,
    ].join('\n');
  }
  const matching = result.contains === null ? '' : ` matching "${result.contains}"`;
  if (result.entries.length === 0) {
    return [
      `Judilibre has no ${result.list} value${matching} for ${court} (${result.total} values in the list).`,
      SOURCE_LINE,
    ].join('\n');
  }
  const paged = pageByBudget(
    result.entries,
    page,
    (e, prev) =>
      entryLine(e).length +
      1 +
      (e.group !== null && e.group !== prev?.group ? e.group.length + 2 : 0),
    { maxItems: MAX_ENTRIES, budget: MAX_TOOL_TEXT - 600 },
  );
  const lines: string[] = [];
  let group: string | null | undefined;
  for (const e of paged.items) {
    if (e.group !== null && e.group !== group) lines.push(`${e.group}:`);
    group = e.group;
    lines.push(entryLine(e));
  }
  return [
    `Judilibre — ${result.entries.length} ${result.list} values${matching} for ${court}. Page ${page} of ${paged.pageCount}.`,
    lines.join('\n'),
    ...(paged.hasMore ? [nextPageHint(page)] : []),
    SOURCE_LINE,
  ].join('\n\n');
}

export function registerListTaxonomyTool(
  server: McpServer,
  listTaxonomy: ListTaxonomy,
  deadlineMs?: number,
): void {
  server.registerTool(
    'judilibre_list_taxonomy',
    {
      title: 'List Judilibre values',
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
        const result = await listTaxonomy(
          {
            list: args.list,
            jurisdiction: args.jurisdiction,
            contains: presentOrUndefined(args.contains),
          },
          { signal },
        );
        return { content: [{ type: 'text', text: renderTaxonomy(result, args.page ?? 1) }] };
      } catch (err) {
        return toToolError(err, signal, 'judilibre');
      }
    },
  );
}
