import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { CASS_CHAMBER_LABELS } from '../../domain/decisions.js';
import { decisionUrl } from '../../domain/links.js';
import {
  CASE_LAW_COLLECTION_LABELS,
  CASE_LAW_DEFAULTS,
  type CaseLawSearchView,
  defaultCaseLawSort,
  LEGIFRANCE_CASE_LAW_COVERAGE_NOTE,
  type SearchCaseLawInput,
} from '../../services/case-law/legifrance.js';
import type { CallContext, CaseLawHit } from '../../services/case-law/ports.js';
import {
  type AnswerBody,
  answerSchema,
  chamberSchema,
  courtSchema,
  DECISION_TITLE_MAX,
  decidedSchema,
  decisionIdSchema,
  decisionPublicationSchema,
  decisionTitleSchema,
  legifranceLinkSchema,
  natureSchema,
  nextSchema,
  numbersSchema,
  orderSchema,
  type Pointer,
  pageSchema,
  pointerSchema,
  requestEcho,
  solutionSchema,
  type ToolContext,
  toolAnswer,
} from '../envelope.js';
import {
  callSignal,
  cut,
  fitting,
  optionalIsoDateSchema,
  presentOrUndefined,
  roomAfter,
  WIDE_PAGE,
} from '../format.js';
import { toolError } from '../tool-error.js';

const TOOL = 'legifrance_search_case_law';
const SOURCE = 'Légifrance';

export type SearchCaseLaw = (
  input: SearchCaseLawInput,
  ctx?: CallContext,
) => Promise<CaseLawSearchView>;

const DESCRIPTION =
  'Search the case law held by Légifrance, by "collection": judicial (JURI: Cour de cassation decisions and some courts of appeal), administrative (CETAT: Conseil d\'État, cours administratives d\'appel, tribunaux administratifs), constitutional (CONSTIT: Conseil constitutionnel), cnil (CNIL deliberations), financial (JUFI: Cour des comptes and the regional and territorial chambers of accounts). ' +
  'Search by words ("query": all the words), by decision "number" (pourvoi numbers in any spelling, e.g. 24-16.924 or 2416924; Conseil constitutionnel numbers as 2026-1217 QPC or 2026-1217; joined decisions carry a combined number such as 2026-1217/1218) or by "ecli" (judicial and administrative). ' +
  'Filters: "date_from" and "date_to"; "court" (cassation, appeal, first_instance) and "chamber" (judicial only; the Cour de cassation chambers); "publication" (judicial, administrative, financial). "sort": relevance (default with criteria) or newest (default without). ' +
  'Each hit shows the court, chamber, decision date, numbers, publication and outcome as the title states them, an excerpt, its official link and the id for legifrance_get_decision. ' +
  'Légifrance holds part of the Cour de cassation decisions, receives them weeks after Judilibre and holds no appeal-court decisions after early 2023; judilibre_search_decisions covers the Cour de cassation and the lower courts directly.';

const inputSchema = z.object({
  collection: z
    .enum(['judicial', 'administrative', 'constitutional', 'cnil', 'financial'])
    .describe(
      'judicial (JURI), administrative (CETAT), constitutional (CONSTIT), cnil, financial (JUFI).',
    ),
  query: z
    .string()
    .optional()
    .describe('Words to find in the decision (all the words must appear).'),
  number: z
    .string()
    .optional()
    .describe(
      'Decision number: pourvoi 24-16.924 or 2416924, CE 400000, CNIL 2026-023, Conseil constitutionnel 2026-1217 QPC or 2026-1217 (joined: 2026-1217/1218), Cour des comptes S-2026-1111.',
    ),
  ecli: z
    .string()
    .optional()
    .describe('ECLI, e.g. ECLI:FR:CCASS:2025:SO01200 (judicial and administrative).'),
  date_from: optionalIsoDateSchema.describe('Earliest decision date, YYYY-MM-DD.'),
  date_to: optionalIsoDateSchema.describe('Latest decision date, YYYY-MM-DD.'),
  court: z
    .enum(['cassation', 'appeal', 'first_instance'])
    .optional()
    .describe('Judicial only: Cour de cassation, courts of appeal, first-instance courts.'),
  chamber: z
    .enum(['plenary', 'mixed', 'civ1', 'civ2', 'civ3', 'commercial', 'social', 'criminal'])
    .optional()
    .describe('Judicial only: Cour de cassation chamber.'),
  publication: z
    .enum(['published', 'unpublished'])
    .optional()
    .describe(
      'Judicial, administrative and financial: published or not, as the source records it.',
    ),
  sort: z
    .enum(['relevance', 'newest'])
    .optional()
    .describe('relevance (default with criteria) or newest (default without).'),
  page: z.number().int().min(1).optional().describe('Page of results (default 1).'),
  page_size: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .describe('Results per page, 1 to 20 (default 10).'),
});

const COURT_WORDS = {
  cassation: 'Cour de cassation',
  appeal: 'courts of appeal',
  first_instance: 'first-instance courts',
} as const;

// ---------------------------------------------------------------------------------------------
// Output schema

const hitSchema = z.object({
  title: decisionTitleSchema,
  id: decisionIdSchema,
  court: courtSchema,
  chamber: chamberSchema,
  nature: natureSchema.describe(
    'Nature of the act (a CNIL title opens with it); null when not given.',
  ),
  decided: decidedSchema,
  numbers: numbersSchema,
  publication: decisionPublicationSchema,
  solution: solutionSchema,
  excerpt: z
    .string()
    .nullable()
    .describe('The matching passage, at most 300 characters; null when none.'),
  link: legifranceLinkSchema,
  read_with: pointerSchema.describe('The tool call that returns the full decision.'),
});

const searchShape = {
  collection: z
    .enum(['judicial', 'administrative', 'constitutional', 'cnil', 'financial'])
    .describe('The collection searched.'),
  results: z.number().int().describe('Number of decisions over all pages.'),
  page: pageSchema,
  order: orderSchema,
  next: nextSchema,
  items: z.array(hitSchema).describe('The decisions of this page.'),
};

const resultsBranch = answerSchema(SOURCE, 'results', searchShape);
const noResultsBranch = answerSchema(SOURCE, 'no_results', searchShape);

export const searchCaseLawOutput = z.discriminatedUnion('outcome', [
  resultsBranch,
  noResultsBranch,
]);

// ---------------------------------------------------------------------------------------------
// Answer builder

export type SearchCaseLawAnswer = AnswerBody<z.input<typeof searchCaseLawOutput>>;
type SearchAnswer = AnswerBody<z.input<typeof resultsBranch | typeof noResultsBranch>>;
type SearchItem = SearchAnswer['items'][number];

/** The criteria of a search, as short phrases. */
function criteriaOf(view: CaseLawSearchView): string[] {
  const { input } = view;
  const decided =
    input.dateFrom && input.dateTo
      ? `decided ${input.dateFrom} to ${input.dateTo}`
      : input.dateFrom
        ? `decided from ${input.dateFrom}`
        : input.dateTo
          ? `decided up to ${input.dateTo}`
          : null;
  return [
    ...(input.query ? [`matching "${input.query}"`] : []),
    // The number as searched (normalised), so a mis-spelt input shows what Légifrance was asked.
    ...(view.query.number ? [`n° ${view.query.number}`] : []),
    ...(input.ecli ? [input.ecli] : []),
    ...(decided ? [decided] : []),
    ...(input.court ? [COURT_WORDS[input.court]] : []),
    ...(input.chamber ? [CASS_CHAMBER_LABELS[input.chamber]] : []),
    ...(input.publication ? [`publication: ${input.publication}`] : []),
  ];
}

function searchItem(hit: CaseLawHit): SearchItem {
  return {
    title: cut(hit.title, DECISION_TITLE_MAX),
    id: hit.id,
    court: hit.court,
    chamber: hit.chamber,
    nature: hit.nature,
    decided: hit.decisionDate,
    numbers: hit.numbers,
    publication: hit.publication,
    solution: hit.solution,
    excerpt: hit.snippet,
    link: decisionUrl(hit.id),
    read_with: { tool: 'legifrance_get_decision', id: hit.id },
  };
}

const ORDERS = { relevance: 'most_relevant_first', newest: 'newest_first' } as const;

const onlyFirst = (shown: number, total: number) =>
  `(Only the first ${shown} of ${total} hits of this page fit — use a smaller "page_size".)`;

export interface SearchCaseLawAnswerOptions {
  /** The call's `request` (`requestEcho`). */
  request: Pointer;
}

/**
 * One page of decisions. Hits that would take the answer past `MAX_TOOL_TEXT` are left out, with a
 * warning. A page without hits (none found, or past the last page) is `no_results`.
 */
export function buildSearchCaseLawAnswer(
  view: CaseLawSearchView,
  opts: SearchCaseLawAnswerOptions,
): SearchCaseLawAnswer {
  const { input, result } = view;
  const pageCount = Math.max(1, view.pageCount);
  const page = view.query.page;
  const pastEnd = result.total > 0 && page > view.pageCount;
  const { request } = opts;
  const judicialNote = input.collection === 'judicial' ? [LEGIFRANCE_CASE_LAW_COVERAGE_NOTE] : [];
  const none =
    result.total === 0
      ? [
          `No ${CASE_LAW_COLLECTION_LABELS[input.collection]} decision on Légifrance matches these criteria: ${criteriaOf(view).join(', ') || 'none'}.`,
          ...judicialNote,
          ...(input.collection === 'constitutional' && input.number && !input.number.includes('/')
            ? [
                'Joined decisions carry a combined number such as "2026-1217/1218"; give the full number, or search by words with "query".',
              ]
            : []),
        ]
      : judicialNote;
  const answer = (
    outcome: 'results' | 'no_results',
    items: SearchItem[],
    extra: string[],
    pageNumber: number,
    pages: number,
    echo: Pointer,
  ): SearchAnswer => ({
    source: SOURCE,
    outcome,
    warnings: [...none, ...extra],
    collection: input.collection,
    results: result.total,
    page: { number: pageNumber, of: pages },
    order: ORDERS[view.query.sort],
    next: pageNumber < pages ? { page: pageNumber + 1 } : null,
    items,
    request: echo,
    cached: [],
  });

  const hits = pastEnd ? [] : result.hits.map(searchItem);
  // The frame is measured with the widest page numbers, so the split does not depend on the page.
  const frame = JSON.stringify(
    answer('results', [], [onlyFirst(hits.length, hits.length)], WIDE_PAGE, WIDE_PAGE + 1, {
      ...request,
      page: WIDE_PAGE,
    }),
  );
  const kept = fitting(hits, roomAfter(frame));
  const extra = kept.length < hits.length ? [onlyFirst(kept.length, hits.length)] : [];
  return answer(
    kept.length === 0 ? 'no_results' : 'results',
    kept,
    extra,
    page,
    pageCount,
    request,
  );
}

export function registerSearchCaseLawTool(
  server: McpServer,
  searchCaseLaw: SearchCaseLaw,
  ctx: ToolContext,
): void {
  server.registerTool(
    TOOL,
    {
      title: 'Search Légifrance case law',
      description: DESCRIPTION,
      inputSchema,
      outputSchema: searchCaseLawOutput,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args, extra) => {
      const request = requestEcho(TOOL, inputSchema, args, {
        sort: defaultCaseLawSort(args),
        ...CASE_LAW_DEFAULTS,
      });
      const signal = callSignal(extra.mcpReq.signal, ctx.deadlineMs);
      try {
        const view = await searchCaseLaw(
          {
            collection: args.collection,
            query: presentOrUndefined(args.query),
            number: presentOrUndefined(args.number),
            ecli: presentOrUndefined(args.ecli),
            dateFrom: presentOrUndefined(args.date_from),
            dateTo: presentOrUndefined(args.date_to),
            court: args.court,
            chamber: args.chamber,
            publication: args.publication,
            sort: args.sort,
            page: args.page,
            pageSize: args.page_size,
          },
          { signal },
        );
        return toolAnswer(searchCaseLawOutput, buildSearchCaseLawAnswer(view, { request }), ctx);
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
