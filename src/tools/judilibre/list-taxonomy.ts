import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { JURISDICTION_LABELS } from '../../domain/judilibre-labels.js';
import {
  JUDILIBRE_TAXONOMY_DEFAULTS,
  type TaxonomyResult,
} from '../../services/case-law/judilibre.js';
import type {
  CallContext,
  JudilibreJurisdiction,
  JudilibreTaxonomyId,
} from '../../services/case-law/ports.js';
import {
  type AnswerBody,
  answerSchema,
  isoSecond,
  judilibreJurisdictionSchema,
  nextSchema,
  type Pointer,
  pageSchema,
  requestEcho,
  type ToolContext,
  toolAnswer,
} from '../envelope.js';
import {
  callSignal,
  jsonCost,
  listPage,
  presentOrUndefined,
  roomAfter,
  WIDE_PAGE,
} from '../format.js';
import { toolError } from '../tool-error.js';

const TOOL = 'judilibre_list_taxonomy';
const SOURCE = 'Judilibre';

export type ListTaxonomy = (
  input: { list: JudilibreTaxonomyId; jurisdiction?: JudilibreJurisdiction; contains?: string },
  ctx?: CallContext,
) => Promise<TaxonomyResult>;

const DESCRIPTION =
  'List the values Judilibre uses to classify decisions, with their keys: "chamber", "formation", "publication", "solution" (outcomes), "location" (courts of the other jurisdictions), "jurisdiction", "theme" and "field". In judilibre_search_decisions, the jurisdiction, formation, solution and location filters take these keys and search_in takes the "field" keys (all but "annexes"); the chamber and publication filters take Vigueur\'s own names instead (e.g. "social", not "soc"; "bulletin", not "b"), listed in that tool\'s input schema; "theme" has no filter. ' +
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

// ---------------------------------------------------------------------------------------------
// Output schema

const entrySchema = z.object({
  key: z
    .string()
    .nullable()
    .describe(
      "The value's key in Judilibre; null when the list has none. The tool description says which judilibre_search_decisions filters take it.",
    ),
  label: z.string().describe('The value as Judilibre labels it.'),
  group: z.string().nullable().describe('The heading the value is listed under; null when none.'),
});

const listShape = {
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
    .describe('The list asked for.'),
  jurisdiction: judilibreJurisdictionSchema.describe('The jurisdiction the list is for.'),
  contains: z
    .string()
    .nullable()
    .describe('The words the labels are filtered by; null when there is no filter.'),
  results: z.number().int().describe('Number of values after the filter, over all pages.'),
  total: z.number().int().describe('Number of values in the whole list.'),
  free_text: z
    .boolean()
    .describe(
      'Judilibre records this list as free text for this jurisdiction, so there is no list.',
    ),
  page: pageSchema,
  next: nextSchema,
  items: z.array(entrySchema).describe('The values of this page.'),
};

const resultsBranch = answerSchema(SOURCE, 'results', listShape);
const noResultsBranch = answerSchema(SOURCE, 'no_results', listShape);

export const listTaxonomyOutput = z.discriminatedUnion('outcome', [resultsBranch, noResultsBranch]);

// ---------------------------------------------------------------------------------------------
// Answer builder

export type ListTaxonomyAnswer = AnswerBody<z.input<typeof listTaxonomyOutput>>;
type ListAnswer = AnswerBody<z.input<typeof resultsBranch | typeof noResultsBranch>>;
type Entry = ListAnswer['items'][number];

export interface ListTaxonomyAnswerOptions {
  /** The call's `request` (`requestEcho`). */
  request: Pointer;
  /** The page asked for, 1-based. */
  page: number;
}

/**
 * One page of a list. A list that is free text for the jurisdiction, no value matching `contains`
 * and a page past the end are `no_results`.
 */
export function buildListTaxonomyAnswer(
  result: TaxonomyResult,
  opts: ListTaxonomyAnswerOptions,
): ListTaxonomyAnswer {
  const { request, page } = opts;
  const court = JURISDICTION_LABELS[result.jurisdiction];
  const head = { list: result.list, jurisdiction: result.jurisdiction };
  if (result.kind === 'free_text') {
    return {
      source: SOURCE,
      outcome: 'no_results',
      warnings: [
        `For ${court}, Judilibre records ${result.list}s as free text, so there is no list to filter on: put the words in "query" instead.`,
      ],
      ...head,
      contains: null,
      results: 0,
      total: 0,
      free_text: true,
      page: { number: page, of: 1 },
      next: null,
      items: [],
      request,
      cached: [],
    };
  }
  const matching = result.contains === null ? '' : ` matching "${result.contains}"`;
  const answer = (
    items: Entry[],
    pageNumber: number,
    pages: number,
    echo: Pointer,
    warnings: string[],
  ): ListAnswer => ({
    source: SOURCE,
    outcome: items.length === 0 ? 'no_results' : 'results',
    warnings,
    ...head,
    contains: result.contains,
    results: result.entries.length,
    total: result.total,
    free_text: false,
    page: { number: pageNumber, of: pages },
    next: pageNumber < pages ? { page: pageNumber + 1 } : null,
    items,
    request: echo,
    cached: [
      {
        what: `Judilibre ${result.list} list (${result.jurisdiction})`,
        retrieved: isoSecond(result.fetchedAt),
      },
    ],
  });
  if (result.entries.length === 0) {
    return answer([], page, 1, request, [
      `Judilibre has no ${result.list} value${matching} for ${court} (${result.total} values in the list).`,
    ]);
  }
  // The frame is measured with the widest page numbers, so the split does not depend on the page.
  const frame = JSON.stringify(
    answer([], WIDE_PAGE, WIDE_PAGE + 1, { ...request, page: WIDE_PAGE }, []),
  );
  const paged = listPage(result.entries, page, (e) => jsonCost(e), {
    maxItems: MAX_ENTRIES,
    budget: roomAfter(frame),
  });
  return answer(
    paged.items.map((e) => ({ key: e.key, label: e.label, group: e.group })),
    page,
    paged.pageCount,
    request,
    [],
  );
}

export function registerListTaxonomyTool(
  server: McpServer,
  listTaxonomy: ListTaxonomy,
  ctx: ToolContext,
): void {
  server.registerTool(
    TOOL,
    {
      title: 'List Judilibre values',
      description: DESCRIPTION,
      inputSchema,
      outputSchema: listTaxonomyOutput,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args, extra) => {
      const request = requestEcho(TOOL, inputSchema, args, JUDILIBRE_TAXONOMY_DEFAULTS);
      const signal = callSignal(extra.mcpReq.signal, ctx.deadlineMs);
      try {
        const result = await listTaxonomy(
          {
            list: args.list,
            jurisdiction: args.jurisdiction,
            contains: presentOrUndefined(args.contains),
          },
          { signal },
        );
        const body = buildListTaxonomyAnswer(result, { request, page: args.page ?? 1 });
        return toolAnswer(listTaxonomyOutput, body, ctx);
      } catch (err) {
        return toolError(err, {
          source: 'judilibre',
          request,
          signal,
          deadlineMs: ctx.deadlineMs,
          now: ctx.now,
        });
      }
    },
  );
}
