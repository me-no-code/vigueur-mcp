import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import {
  CHAMBER_LABELS,
  CHAMBER_WIRE,
  FORMATION_LABELS,
  JURISDICTION_LABELS,
  labelOf,
  PUBLICATION_LABELS,
  PUBLICATION_WIRE,
  SOLUTION_LABELS,
} from '../../domain/judilibre-labels.js';
import { judilibreDecisionUrl } from '../../domain/links.js';
import {
  JUDILIBRE_SEARCH_DEFAULTS,
  type JudilibreMatch,
  type JudilibreSearchView,
  type SearchJudilibreInput,
} from '../../services/case-law/judilibre.js';
import type { CallContext, JudilibreHit } from '../../services/case-law/ports.js';
import {
  type AnswerBody,
  answerSchema,
  chamberSchema,
  DECISION_TITLE_MAX,
  decidedSchema,
  decisionTitleSchema,
  ecliSchema,
  formationSchema,
  judilibreIdSchema,
  judilibreJurisdictionSchema,
  judilibreLinkSchema,
  locationSchema,
  nextSchema,
  numbersSchema,
  orderSchema,
  type Pointer,
  pageSchema,
  pointerSchema,
  publicationListSchema,
  requestEcho,
  solutionSchema,
  type ToolContext,
  toolAnswer,
} from '../envelope.js';
import {
  callSignal,
  cut,
  FRAME_SLACK,
  jsonCost,
  MAX_TOOL_TEXT,
  optionalIsoDateSchema,
  presentOrUndefined,
  WIDE_PAGE,
} from '../format.js';
import { toolError } from '../tool-error.js';

const TOOL = 'judilibre_search_decisions';
const SOURCE = 'Judilibre';

export type SearchDecisions = (
  input: SearchJudilibreInput,
  ctx?: CallContext,
) => Promise<JudilibreSearchView>;

const DESCRIPTION =
  'Search the case law of Judilibre, the Cour de cassation\'s open-data base: Cour de cassation decisions (jurisdiction "cc", the default) and, with "jurisdiction", decisions of courts of appeal (ca), first-instance courts (tj), commercial courts (tcom) and labour courts (cph). ' +
  'A pourvoi number (e.g. 23-20.348) or an ECLI given as "query" finds that decision. "match" sets how the words combine: all_words (default), any_word, or exact_phrase for a fixed expression. ' +
  'Filters "chamber", "formation", "publication" and "solution" apply to the Cour de cassation only; "location" to the other courts. Each hit shows the court, chamber, date, numbers, ECLI, formation, publication, outcome, the Cour de cassation\'s summary when it has one, a matching excerpt and its official link; read a decision with judilibre_get_decision. ' +
  "Names of natural persons are pseudonymised by the source. Judilibre holds the Cour de cassation and the lower courts only; the Conseil d'État, the Conseil constitutionnel, the CNIL and the financial courts are in legifrance_search_case_law.";

const inputSchema = z.object({
  query: z
    .string()
    .describe(
      'Search words, a pourvoi number (23-20.348) or an ECLI. Required: Judilibre finds nothing without it.',
    ),
  match: z
    .enum(['all_words', 'any_word', 'exact_phrase'])
    .optional()
    .describe(
      'How the words combine: all_words (default), any_word, exact_phrase (the words in that order).',
    ),
  jurisdiction: z
    .enum(['cc', 'ca', 'tj', 'tcom', 'cph'])
    .optional()
    .describe(
      'cc Cour de cassation (default), ca courts of appeal, tj tribunaux judiciaires, tcom commercial courts, cph labour courts.',
    ),
  chamber: z
    .enum(['plenary', 'mixed', 'civ1', 'civ2', 'civ3', 'commercial', 'social', 'criminal'])
    .optional()
    .describe('Cour de cassation chamber (jurisdiction cc only).'),
  formation: z
    .enum(['fp', 'fm', 'fs', 'f', 'frh', 'frr'])
    .optional()
    .describe('Cour de cassation formation (cc only); list them with judilibre_list_taxonomy.'),
  publication: z
    .enum(['bulletin', 'report', 'chamber_letter', 'press_release'])
    .optional()
    .describe('Publication of the decision (cc only).'),
  solution: z
    .string()
    .optional()
    .describe(
      'Outcome key, e.g. "cassation" or "rejet" (cc only); list them with judilibre_list_taxonomy.',
    ),
  location: z
    .string()
    .optional()
    .describe(
      'Court key for ca, tj, tcom and cph (list with judilibre_list_taxonomy, list "location").',
    ),
  search_in: z
    .enum([
      'text',
      'introduction',
      'expose',
      'moyens',
      'motivations',
      'dispositif',
      'visa',
      'summary',
      'themes',
    ])
    .optional()
    .describe('Restrict the search to one part of the decision (default: all).'),
  date_from: optionalIsoDateSchema.describe('Earliest decision date, YYYY-MM-DD.'),
  date_to: optionalIsoDateSchema.describe('Latest decision date, YYYY-MM-DD.'),
  sort: z
    .enum(['relevance', 'newest', 'oldest'])
    .optional()
    .describe('relevance (default), newest or oldest by decision date.'),
  page: z.number().int().min(1).optional().describe('Page of results (default 1).'),
  page_size: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .describe('Results per page, 1 to 20 (default 10).'),
});

const MATCH_WORDS: Record<JudilibreMatch, string> = {
  all_words: 'all words',
  any_word: 'any word',
  exact_phrase: 'exact phrase',
};

/** Judilibre pages through its first 10 000 results only. */
const MAX_WINDOW = 10_000;
const SUMMARY_MAX = 600;
const EXCERPT_MAX = 700;

// ---------------------------------------------------------------------------------------------
// Output schema

const hitSchema = z.object({
  title: decisionTitleSchema.describe(
    'Court, chamber, decision date, numbers and ECLI as one line; cut to 300 characters.',
  ),
  id: judilibreIdSchema,
  ecli: ecliSchema,
  link: judilibreLinkSchema,
  jurisdiction: judilibreJurisdictionSchema,
  location: locationSchema,
  chamber: chamberSchema,
  decided: decidedSchema,
  numbers: numbersSchema,
  formation: formationSchema,
  publication: publicationListSchema,
  solution: solutionSchema,
  summary: z
    .string()
    .nullable()
    .describe("The Cour de cassation's summary; cut to 600 characters; null when none."),
  excerpt: z
    .string()
    .nullable()
    .describe('The matching passages joined with " … "; cut to 700 characters; null when none.'),
  read_with: pointerSchema.describe('The tool call that returns the full decision.'),
});

const searchShape = {
  results: z.number().int().describe('Number of decisions over all pages.'),
  page: pageSchema,
  order: orderSchema,
  next: nextSchema,
  relaxed: z
    .boolean()
    .describe('Judilibre found no exact match and loosened the search to some of the words.'),
  items: z.array(hitSchema).describe('The decisions of this page.'),
};

const resultsBranch = answerSchema(SOURCE, 'results', searchShape);
const noResultsBranch = answerSchema(SOURCE, 'no_results', searchShape);

export const searchDecisionsOutput = z.discriminatedUnion('outcome', [
  resultsBranch,
  noResultsBranch,
]);

// ---------------------------------------------------------------------------------------------
// Answer builder

export type SearchDecisionsAnswer = AnswerBody<z.input<typeof searchDecisionsOutput>>;
type SearchAnswer = AnswerBody<z.input<typeof resultsBranch | typeof noResultsBranch>>;
type SearchItem = SearchAnswer['items'][number];

/** The criteria of a search other than the query, as short phrases. */
function filtersOf(input: JudilibreSearchView['input']): string[] {
  return [
    ...(input.chamber ? [labelOf(CHAMBER_LABELS, CHAMBER_WIRE[input.chamber])] : []),
    ...(input.formation ? [labelOf(FORMATION_LABELS, input.formation)] : []),
    ...(input.publication
      ? [labelOf(PUBLICATION_LABELS, PUBLICATION_WIRE[input.publication])]
      : []),
    ...(input.solution ? [labelOf(SOLUTION_LABELS, input.solution)] : []),
    ...(input.location ? [`location ${input.location}`] : []),
    ...(input.searchIn ? [`searched in ${input.searchIn}`] : []),
    ...(input.dateFrom ? [`from ${input.dateFrom}`] : []),
    ...(input.dateTo ? [`to ${input.dateTo}`] : []),
  ];
}

/** `{court}, {chamber} — decision of {date} — n° {numbers} — {ecli}`: the title of a decision. */
export function identityLine(
  d: Pick<
    JudilibreHit,
    'jurisdiction' | 'chamber' | 'location' | 'decisionDate' | 'numbers' | 'ecli'
  >,
): string {
  // A court of appeal's location label already names the jurisdiction ("Cour d'appel de Paris").
  const location = d.location?.label.includes(d.jurisdiction.label)
    ? [d.location.label]
    : [d.jurisdiction.label, d.location?.label];
  const court = [...location, d.chamber?.label].filter(Boolean).join(', ');
  return [
    court,
    ...(d.decisionDate ? [`decision of ${d.decisionDate}`] : []),
    ...(d.numbers.length > 0 ? [`n° ${d.numbers.join(', ')}`] : []),
    ...(d.ecli ? [d.ecli] : []),
  ].join(' — ');
}

function searchItem(hit: JudilibreHit): SearchItem {
  return {
    title: cut(identityLine(hit), DECISION_TITLE_MAX),
    id: hit.id,
    ecli: hit.ecli,
    link: judilibreDecisionUrl(hit.id),
    jurisdiction: hit.jurisdiction.key,
    location: hit.location?.label ?? null,
    chamber: hit.chamber?.label ?? null,
    decided: hit.decisionDate,
    numbers: hit.numbers,
    formation: hit.formation?.label ?? null,
    publication: hit.publication.map((p) => p.label),
    solution: hit.solution?.label ?? hit.solutionText,
    summary: hit.summary === null ? null : cut(hit.summary, SUMMARY_MAX),
    excerpt: hit.highlights.length > 0 ? cut(hit.highlights.join(' … '), EXCERPT_MAX) : null,
    read_with: { tool: 'judilibre_get_decision', id: hit.id },
  };
}

const ORDERS = {
  relevance: 'most_relevant_first',
  newest: 'newest_first',
  oldest: 'oldest_first',
} as const;

const RELAXED_NOTICE =
  'Judilibre found no exact match and loosened the search: these results match only some of the words.';
const CAPPED_NOTICE =
  'Only the first 10 000 are reachable by paging; narrow the search to see the others.';

const onlyFirst = (shown: number, total: number) =>
  `(Only the first ${shown} of ${total} hits of this page fit — use a smaller "page_size".)`;

export interface SearchDecisionsAnswerOptions {
  /** The call's `request` (`requestEcho`). */
  request: Pointer;
}

/**
 * One page of decisions. Hits that would take the answer past `MAX_TOOL_TEXT` are left out, with a
 * warning. A page without hits (none found, or past the last page) is `no_results`.
 */
export function buildSearchDecisionsAnswer(
  view: JudilibreSearchView,
  opts: SearchDecisionsAnswerOptions,
): SearchDecisionsAnswer {
  const { input, result } = view;
  const pageCount = Math.max(1, view.pageCount);
  const page = input.page;
  const pastEnd = result.total > 0 && page > view.pageCount;
  const { request } = opts;
  const none =
    result.total === 0
      ? (() => {
          const criteria = [
            MATCH_WORDS[input.match],
            labelOf(JURISDICTION_LABELS, input.jurisdiction),
            ...filtersOf(input),
          ].join(', ');
          return [
            `No Judilibre decision matches "${input.query}" with these criteria: ${criteria}.`,
          ];
        })()
      : [];
  const notices = [
    ...(result.total > MAX_WINDOW ? [CAPPED_NOTICE] : []),
    ...(result.relaxed ? [RELAXED_NOTICE] : []),
  ];
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
    warnings: [...none, ...notices, ...extra],
    results: result.total,
    page: { number: pageNumber, of: pages },
    order: ORDERS[input.sort],
    next: pageNumber < pages ? { page: pageNumber + 1 } : null,
    relaxed: result.relaxed,
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
  ).length;
  let used = frame + FRAME_SLACK;
  let shown = 0;
  for (const item of hits) {
    const cost = jsonCost(item);
    if (shown > 0 && used + cost > MAX_TOOL_TEXT) break;
    used += cost;
    shown += 1;
  }
  const extra = shown < hits.length ? [onlyFirst(shown, hits.length)] : [];
  return answer(
    shown === 0 ? 'no_results' : 'results',
    hits.slice(0, shown),
    extra,
    page,
    pageCount,
    request,
  );
}

export function registerSearchDecisionsTool(
  server: McpServer,
  searchDecisions: SearchDecisions,
  ctx: ToolContext,
): void {
  server.registerTool(
    TOOL,
    {
      title: 'Search Judilibre decisions',
      description: DESCRIPTION,
      inputSchema,
      outputSchema: searchDecisionsOutput,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args, extra) => {
      const request = requestEcho(TOOL, inputSchema, args, JUDILIBRE_SEARCH_DEFAULTS);
      const signal = callSignal(extra.mcpReq.signal, ctx.deadlineMs);
      try {
        const view = await searchDecisions(
          {
            query: args.query,
            match: args.match,
            jurisdiction: args.jurisdiction,
            chamber: args.chamber,
            formation: args.formation,
            publication: args.publication,
            solution: presentOrUndefined(args.solution),
            location: presentOrUndefined(args.location),
            searchIn: args.search_in,
            dateFrom: presentOrUndefined(args.date_from),
            dateTo: presentOrUndefined(args.date_to),
            sort: args.sort,
            page: args.page,
            pageSize: args.page_size,
          },
          { signal },
        );
        return toolAnswer(
          searchDecisionsOutput,
          buildSearchDecisionsAnswer(view, { request }),
          ctx,
        );
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
