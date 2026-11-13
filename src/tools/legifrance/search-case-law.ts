import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { CASS_CHAMBER_LABELS } from '../../domain/decisions.js';
import { decisionUrl } from '../../domain/links.js';
import {
  CASE_LAW_COLLECTION_LABELS,
  type CaseLawSearchView,
  LEGIFRANCE_CASE_LAW_COVERAGE_NOTE,
  type SearchCaseLawInput,
} from '../../services/case-law/legifrance.js';
import type { CallContext, CaseLawHit } from '../../services/case-law/ports.js';
import {
  callSignal,
  MAX_TOOL_TEXT,
  nextPageHint,
  optionalIsoDateSchema,
  presentOrUndefined,
} from '../format.js';
import { toToolError } from '../tool-error.js';

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

const SORT_WORDS = { relevance: 'most relevant first', newest: 'newest first' } as const;
const COURT_WORDS = {
  cassation: 'Cour de cassation',
  appeal: 'courts of appeal',
  first_instance: 'first-instance courts',
} as const;

const TITLE_MAX = 300;
const EXCERPT_MAX = 700;
const cut = (s: string, max: number): string =>
  s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;

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

/** `{court}{, chamber} — decision of {date} — n° {numbers} — {publication} — {solution}`, or the raw title. */
function identityOf(hit: CaseLawHit): string {
  // A title that did not parse is shown as the source wrote it, whatever the date says.
  if (hit.court === null) return hit.title;
  // A CNIL title opens with the kind of act ("Délibération", "Décision"): the parsed title's nature.
  const kind = hit.collection === 'cnil' ? (hit.nature ?? undefined) : undefined;
  const court = [kind, hit.court, hit.chamber].filter(Boolean).join(', ');
  return [
    court,
    ...(hit.decisionDate ? [`decision of ${hit.decisionDate}`] : []),
    ...(hit.numbers.length > 0 ? [`n° ${hit.numbers.join(', ')}`] : []),
    ...(hit.publication ? [hit.publication] : []),
    ...(hit.solution ? [hit.solution] : []),
  ]
    .filter((p) => p !== '')
    .join(' — ');
}

function renderHit(hit: CaseLawHit, n: number): string {
  const subject = hit.collection === 'cnil' || hit.collection === 'constitutional';
  return [
    `${n}. ${identityOf(hit)}`,
    ...(subject ? [`Title: ${cut(hit.title, TITLE_MAX)}`] : []),
    ...(hit.snippet ? [`Excerpt: ${cut(hit.snippet, EXCERPT_MAX)}`] : []),
    `Source: Légifrance · ${decisionUrl(hit.id)}`,
    `Full text: legifrance_get_decision id "${hit.id}"`,
  ].join('\n');
}

/** A page of hits with its header; every hit carries its source and a pointer to its full text. */
export function renderSearch(view: CaseLawSearchView): string {
  const { input, result } = view;
  const label = CASE_LAW_COLLECTION_LABELS[input.collection];
  const judicialNote = input.collection === 'judicial' ? [LEGIFRANCE_CASE_LAW_COVERAGE_NOTE] : [];
  const criteria = criteriaOf(view);
  if (result.total === 0) {
    return [
      `No ${label} decision on Légifrance matches these criteria: ${criteria.length > 0 ? criteria.join(', ') : 'none'}.`,
      ...judicialNote,
      ...(input.collection === 'constitutional' && input.number && !input.number.includes('/')
        ? [
            'Joined decisions carry a combined number such as "2026-1217/1218"; give the full number, or search by words with "query".',
          ]
        : []),
    ].join('\n');
  }
  const page = view.query.page;
  const sort = view.query.sort;
  const header = `Légifrance — ${label}: ${result.total} decisions${criteria.length > 0 ? `${criteria[0]?.startsWith('matching') ? ' ' : ', '}${criteria.join(', ')}` : ''}. Page ${page} of ${view.pageCount}, ${SORT_WORDS[sort]}.`;
  if (result.hits.length === 0) {
    return `${header}\nPage ${page} is past the last page (${view.pageCount}).`;
  }
  const first = (page - 1) * view.query.pageSize;
  const tail = page < view.pageCount ? [nextPageHint(page)] : [];
  let used = [header, ...judicialNote, ...tail].join('\n').length + 300;
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
  return [[header, ...judicialNote].join('\n'), ...blocks, ...shown, ...tail].join('\n\n');
}

export function registerSearchCaseLawTool(
  server: McpServer,
  searchCaseLaw: SearchCaseLaw,
  deadlineMs?: number,
): void {
  server.registerTool(
    'legifrance_search_case_law',
    {
      title: 'Search Légifrance case law',
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
        return { content: [{ type: 'text', text: renderSearch(view) }] };
      } catch (err) {
        return toToolError(err, signal, 'legifrance');
      }
    },
  );
}
