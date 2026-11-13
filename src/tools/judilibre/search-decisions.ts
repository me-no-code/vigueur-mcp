import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import {
  CHAMBER_LABELS,
  CHAMBER_WIRE,
  FORMATION_LABELS,
  JURISDICTION_LABELS,
  labelOf,
  PUBLICATION_LABELS,
  SOLUTION_LABELS,
} from '../../domain/judilibre-labels.js';
import { judilibreDecisionUrl } from '../../domain/links.js';
import type {
  JudilibreMatch,
  JudilibreSearchView,
  SearchJudilibreInput,
} from '../../services/case-law/judilibre.js';
import type { CallContext, JudilibreHit } from '../../services/case-law/ports.js';
import {
  callSignal,
  MAX_TOOL_TEXT,
  nextPageHint,
  optionalIsoDateSchema,
  presentOrUndefined,
} from '../format.js';
import { toToolError } from '../tool-error.js';

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
const SORT_WORDS = {
  relevance: 'most relevant first',
  newest: 'newest first',
  oldest: 'oldest first',
} as const;

/** Judilibre pages through its first 10 000 results only. */
const MAX_WINDOW = 10_000;
const SUMMARY_MAX = 600;
const EXCERPT_MAX = 700;

const cut = (s: string, max: number): string =>
  s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;

/** The criteria of a search other than the query, as short phrases. */
function filtersOf(input: JudilibreSearchView['input']): string[] {
  const wirePublication = { bulletin: 'b', report: 'r', chamber_letter: 'l', press_release: 'c' };
  return [
    ...(input.chamber ? [labelOf(CHAMBER_LABELS, CHAMBER_WIRE[input.chamber])] : []),
    ...(input.formation ? [labelOf(FORMATION_LABELS, input.formation)] : []),
    ...(input.publication ? [labelOf(PUBLICATION_LABELS, wirePublication[input.publication])] : []),
    ...(input.solution ? [labelOf(SOLUTION_LABELS, input.solution)] : []),
    ...(input.location ? [`location ${input.location}`] : []),
    ...(input.searchIn ? [`searched in ${input.searchIn}`] : []),
    ...(input.dateFrom ? [`from ${input.dateFrom}`] : []),
    ...(input.dateTo ? [`to ${input.dateTo}`] : []),
  ];
}

/** `{court}, {chamber} — decision of {date} — n° {numbers} — {ecli}`: shared with the decision page. */
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

/** The publication labels, or for a Cour de cassation decision without any, that it is not in the Bulletin. */
export function publicationText(
  d: Pick<JudilibreHit, 'jurisdiction' | 'publication'>,
): string | null {
  if (d.publication.length > 0) return d.publication.map((p) => p.label).join(', ');
  return d.jurisdiction.key === 'cc' ? 'not published in the Bulletin' : null;
}

function renderHit(hit: JudilibreHit, n: number): string {
  const publication = publicationText(hit);
  const second = [hit.formation?.label, publication, hit.solution?.label ?? hit.solutionText]
    .filter((p): p is string => Boolean(p))
    .join(' · ');
  return [
    `${n}. ${identityLine(hit)}`,
    ...(second ? [second] : []),
    ...(hit.summary ? [`Summary: ${cut(hit.summary, SUMMARY_MAX)}`] : []),
    ...(hit.highlights.length > 0
      ? [`Excerpt: ${cut(hit.highlights.join(' … '), EXCERPT_MAX)}`]
      : []),
    `Source: Judilibre · ${judilibreDecisionUrl(hit.id)}`,
    `Full text: judilibre_get_decision id "${hit.id}"`,
  ].join('\n');
}

/** A page of hits with its header; every hit carries its source and a pointer to its full text. */
export function renderSearch(view: JudilibreSearchView): string {
  const { input, result } = view;
  const court = labelOf(JURISDICTION_LABELS, input.jurisdiction);
  const filters = filtersOf(input);
  const criteria = [MATCH_WORDS[input.match], court, ...filters].join(', ');
  if (result.total === 0) {
    const tries = [
      ...(input.match === 'any_word' ? [] : ['"match": "any_word"']),
      'fewer filters',
      'another jurisdiction',
      "legifrance_search_case_law (Conseil d'État, Conseil constitutionnel, CNIL, financial courts, older Cour de cassation decisions)",
    ];
    return [
      `No Judilibre decision matches "${input.query}" with these criteria: ${criteria}.`,
      `Try ${tries.slice(0, -1).join(', ')} or ${tries.at(-1)}.`,
    ].join('\n');
  }
  const capped =
    result.total > MAX_WINDOW
      ? ' Only the first 10 000 are reachable by paging; narrow the search to see the others.'
      : '';
  const header = `Judilibre — ${result.total} decisions match "${input.query}" (${criteria}).${capped} Page ${input.page} of ${view.pageCount}, ${SORT_WORDS[input.sort]}.`;
  if (result.hits.length === 0) {
    return `${header}\nPage ${input.page} is past the last page (${view.pageCount}).`;
  }
  const first = (input.page - 1) * input.pageSize;
  const tail = input.page < view.pageCount ? [nextPageHint(input.page)] : [];
  const relaxed = result.relaxed
    ? [
        'Judilibre found no exact match and loosened the search: these results match only some of the words.',
      ]
    : [];
  // Cap the page: a hit is up to ~1 900 characters, so 20 long ones could pass MAX_TOOL_TEXT.
  let used = [header, ...relaxed, ...tail].join('\n\n').length + 200;
  const blocks: string[] = [];
  for (const [i, hit] of result.hits.entries()) {
    const block = renderHit(hit, first + i + 1);
    if (blocks.length > 0 && used + block.length + 2 > MAX_TOOL_TEXT) break;
    blocks.push(block);
    used += block.length + 2;
  }
  const shown =
    blocks.length < result.hits.length
      ? [
          `(Only the first ${blocks.length} of ${result.hits.length} hits of this page fit — use a smaller "page_size".)`,
        ]
      : [];
  return [header, ...relaxed, ...blocks, ...shown, ...tail].join('\n\n');
}

export function registerSearchDecisionsTool(
  server: McpServer,
  searchDecisions: SearchDecisions,
  deadlineMs?: number,
): void {
  server.registerTool(
    'judilibre_search_decisions',
    {
      title: 'Search Judilibre decisions',
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
        return { content: [{ type: 'text', text: renderSearch(view) }] };
      } catch (err) {
        return toToolError(err, signal, 'judilibre');
      }
    },
  );
}
