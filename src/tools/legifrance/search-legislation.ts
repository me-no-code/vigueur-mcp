import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { articleUrlFor, jorfUrl, kaliUrl, lodaUrl } from '../../domain/links.js';
import type {
  CallContext,
  LegislationCollection,
  LegislationHit,
  LegislationSearchPage,
} from '../../services/legislation/ports.js';
import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  type SearchLegislationInput,
} from '../../services/legislation/search.js';
import {
  type AnswerBody,
  answerSchema,
  fromSchema,
  legifranceLinkSchema,
  legifranceStatusSchema,
  natureSchema,
  nextSchema,
  norSchema,
  type Pointer,
  pageSchema,
  pointerSchema,
  publishedSchema,
  requestEcho,
  type ToolContext,
  toolAnswer,
  untilSchema,
} from '../envelope.js';
import {
  callSignal,
  cut,
  FRAME_SLACK,
  jsonCost,
  MAX_TOOL_TEXT,
  optionalIsoDateSchema,
  presentOrUndefined,
  responseFormatSchema,
} from '../format.js';
import { toolError } from '../tool-error.js';

const TOOL = 'legifrance_search_legislation';
const SOURCE = 'Légifrance';

export type SearchLegislation = (
  input: SearchLegislationInput,
  ctx?: CallContext,
) => Promise<LegislationSearchPage>;

const DESCRIPTION =
  'Search French legislation on Légifrance. Collections: "codes" = consolidated codes (Code civil, Code du travail…), searchable by article number; "loda" = consolidated laws, ordinances, decrees and orders; "jorf" = the Journal officiel as published (by NOR, text number, or narrowed by publication date); "kali" = national collective agreements (by IDCC). Give at least one of query, article_number, text_number, nor or idcc; code, nature and the publication dates only narrow a search. "codes" and "loda" results are the versions in force on at_date (default: today); "jorf" results are texts as published (no in-force filter: use published_from / published_to); "kali" results are the agreements currently in force, extended or not (at_date does not apply). Set include_historical to get every version. Every hit has its legifrance.gouv.fr link; use legifrance_get_article to read the full text of a code or collective agreement article hit.';

const inputSchema = z.object({
  collection: z
    .enum(['codes', 'loda', 'jorf', 'kali'])
    .describe('Where to search: codes, loda, jorf or kali.'),
  query: z.string().optional().describe('Free-text words to search for.'),
  code: z.string().optional().describe('Code title, e.g. "Code civil" (collection "codes").'),
  article_number: z
    .string()
    .optional()
    .describe('Article number as cited, e.g. "1240", "L. 1234-1" (collection "codes").'),
  text_number: z
    .string()
    .optional()
    .describe('Number of the text, e.g. "2016-131" for the ordonnance n°2016-131.'),
  nor: z
    .string()
    .optional()
    .describe('NOR identifier of a text published in the Journal officiel.'),
  nature: z.string().optional().describe('Nature of the text, e.g. "LOI", "ORDONNANCE", "DECRET".'),
  idcc: z
    .string()
    .optional()
    .describe('IDCC number of a collective agreement (collection "kali").'),
  at_date: optionalIsoDateSchema.describe(
    'Date the texts must be in force, YYYY-MM-DD (collections "codes" and "loda" only). Default: today.',
  ),
  include_historical: z
    .boolean()
    .optional()
    .describe(
      'true = return every version, whatever its dates (at_date is then ignored). For "codes" and "loda"; no effect on "jorf" and "kali", where at_date is rejected.',
    ),
  published_from: optionalIsoDateSchema.describe(
    'Earliest publication date, YYYY-MM-DD (collection "jorf").',
  ),
  published_to: optionalIsoDateSchema.describe(
    'Latest publication date, YYYY-MM-DD (collection "jorf").',
  ),
  page: z.number().int().min(1).optional().describe('Page of results (default 1).'),
  page_size: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe('Results per page, 1 to 50 (default 10).'),
  response_format: responseFormatSchema
    .optional()
    .describe('"concise" (default): short snippets, ids and links. "detailed": full snippets.'),
});

const EXCERPT_CONCISE = 200;

// ---------------------------------------------------------------------------------------------
// Output schema

const hitSchema = z.object({
  kind: z.enum(['article', 'text']).describe('An article, or a whole text.'),
  title: z.string().describe('Title of the text the hit belongs to, or of the text itself.'),
  number: z.string().nullable().describe('Article number; null for a text.'),
  id: z.string().describe('Légifrance id of the article version or of the text.'),
  text_id: z.string().describe('Légifrance id of the text the hit belongs to.'),
  nature: natureSchema,
  nor: norSchema,
  published: publishedSchema,
  legifrance_status: legifranceStatusSchema,
  from: fromSchema,
  until: untilSchema,
  link: legifranceLinkSchema,
  excerpt: z
    .string()
    .nullable()
    .describe('The matching passage; cut to 200 characters in a concise answer; null when none.'),
  read_with: pointerSchema
    .nullable()
    .describe('The tool call that returns the full article or text; null when no tool reads it.'),
});

const searchShape = {
  collection: z.enum(['codes', 'loda', 'jorf', 'kali']).describe('The collection searched.'),
  scope: z
    .enum(['as_published', 'all_versions', 'in_force_on'])
    .describe(
      'as_published: texts as published (jorf); all_versions: every version, whatever its dates; in_force_on: versions in force on `request.at_date` (kali: the agreements in force now, extended or not, with no date).',
    ),
  results: z.number().int().describe('Number of hits over all pages.'),
  page: pageSchema,
  next: nextSchema,
  items: z.array(hitSchema).describe('The hits of this page.'),
};

const resultsBranch = answerSchema(SOURCE, 'results', searchShape);
const noResultsBranch = answerSchema(SOURCE, 'no_results', searchShape);

export const searchLegislationOutput = z.discriminatedUnion('outcome', [
  resultsBranch,
  noResultsBranch,
]);

// ---------------------------------------------------------------------------------------------
// Answer builder

export type SearchLegislationAnswer = AnswerBody<z.input<typeof searchLegislationOutput>>;
type SearchAnswer = AnswerBody<z.input<typeof resultsBranch | typeof noResultsBranch>>;
type SearchItem = SearchAnswer['items'][number];

function hitUrl(hit: LegislationHit): string {
  if (hit.kind === 'article') return articleUrlFor(hit.id);
  if (hit.id.startsWith('JORFTEXT')) return jorfUrl(hit.id);
  if (hit.id.startsWith('KALITEXT')) return kaliUrl(hit.id);
  return lodaUrl(hit.id);
}

/**
 * The tool call that reads a hit: a code or collective agreement article, a LODA or JORF text.
 * A LEGITEXT text is read at `atDate`: the date the search was run at, or for an every-version
 * search the start of the version the hit lists.
 */
function readWith(hit: LegislationHit, atDate: string | undefined): Pointer | null {
  if (/^(?:LEGIARTI|KALIARTI)/.test(hit.id)) {
    return { tool: 'legifrance_get_article', id: hit.id };
  }
  if (hit.kind === 'text' && /^(?:LEGITEXT|JORFTEXT)/.test(hit.id)) {
    // A LEGITEXT is read as of today unless dated; a JORFTEXT is read as published, with no date.
    return hit.id.startsWith('LEGITEXT') && atDate !== undefined
      ? { tool: 'legifrance_get_text', id: hit.textId, at_date: atDate }
      : { tool: 'legifrance_get_text', id: hit.textId };
  }
  return null;
}

function searchItem(
  hit: LegislationHit,
  detailed: boolean,
  atDate: string | undefined,
  scope: SearchAnswer['scope'],
): SearchItem {
  return {
    kind: hit.kind,
    title: hit.title,
    number: hit.articleNumber,
    id: hit.id,
    text_id: hit.textId,
    nature: hit.nature,
    nor: hit.nor,
    published: hit.publishedOn,
    legifrance_status: hit.rawStatus || null,
    from: hit.validFrom,
    until: hit.validTo,
    link: hitUrl(hit),
    excerpt: hit.snippet === null || detailed ? hit.snippet : cut(hit.snippet, EXCERPT_CONCISE),
    // An every-version search ignores at_date: its hit is read at the start of its own version.
    read_with: readWith(hit, scope === 'all_versions' ? (hit.validFrom ?? undefined) : atDate),
  };
}

/** What each collection's results really are: only codes and loda filter by date. */
export function searchScope(
  collection: LegislationCollection,
  includeHistorical: boolean,
): SearchAnswer['scope'] {
  if (collection === 'jorf') return 'as_published';
  return includeHistorical ? 'all_versions' : 'in_force_on';
}

export interface SearchAnswerOptions {
  /** The call's `request` (`requestEcho`). */
  request: Pointer;
  collection: LegislationCollection;
  scope: SearchAnswer['scope'];
  detailed: boolean;
  /** An article number filter was given: totals can exceed the hits shown. */
  filteredByArticleNumber: boolean;
}

const onlyFirst = (shown: number, total: number) =>
  `(Only the first ${shown} of ${total} hits of this page fit — use a smaller "page_size".)`;

/**
 * One page of hits. Hits that would take the answer past `MAX_TOOL_TEXT` are left out, with a
 * warning. A page without hits (none found, or past the last page) is `no_results`.
 */
export function buildSearchLegislationAnswer(
  result: LegislationSearchPage,
  opts: SearchAnswerOptions,
): SearchLegislationAnswer {
  const pageCount = Math.max(1, Math.ceil(result.total / result.pageSize));
  const warnings = opts.filteredByArticleNumber
    ? ['(Counts include texts filtered out by the article number; showing matches only.)']
    : [];
  const answer = (
    outcome: 'results' | 'no_results',
    items: SearchItem[],
    extra: string[],
  ): SearchAnswer => ({
    source: SOURCE,
    outcome,
    warnings: [...warnings, ...extra],
    collection: opts.collection,
    scope: opts.scope,
    results: result.total,
    page: { number: result.page, of: pageCount },
    next: result.page * result.pageSize < result.total ? { page: result.page + 1 } : null,
    items,
    request: opts.request,
    cached: [],
  });

  const atDate = typeof opts.request.at_date === 'string' ? opts.request.at_date : undefined;
  const hits = result.hits.map((h) => searchItem(h, opts.detailed, atDate, opts.scope));
  const frame = JSON.stringify(answer('results', [], [onlyFirst(hits.length, hits.length)])).length;
  let used = frame + FRAME_SLACK;
  let shown = 0;
  for (const item of hits) {
    const cost = jsonCost(item);
    if (shown > 0 && used + cost > MAX_TOOL_TEXT) break;
    used += cost;
    shown += 1;
  }
  const extra = shown < hits.length ? [onlyFirst(shown, hits.length)] : [];
  return answer(shown === 0 ? 'no_results' : 'results', hits.slice(0, shown), extra);
}

export function registerSearchLegislationTool(
  server: McpServer,
  searchLegislation: SearchLegislation,
  ctx: ToolContext,
): void {
  server.registerTool(
    TOOL,
    {
      title: 'Search French legislation',
      description: DESCRIPTION,
      inputSchema,
      outputSchema: searchLegislationOutput,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args, extra) => {
      const includeHistorical = args.include_historical ?? false;
      const datedCollection = args.collection === 'codes' || args.collection === 'loda';
      const request = requestEcho(TOOL, inputSchema, args, {
        // `at_date` is ignored for every version, and does not apply to jorf and kali.
        ...(datedCollection && !includeHistorical && { at_date: ctx.today() }),
        include_historical: false,
        page: DEFAULT_PAGE,
        page_size: DEFAULT_PAGE_SIZE,
        response_format: 'concise',
      });
      const signal = callSignal(extra.mcpReq.signal, ctx.deadlineMs);
      try {
        const input: SearchLegislationInput = {
          collection: args.collection,
          query: presentOrUndefined(args.query),
          code: presentOrUndefined(args.code),
          articleNumber: presentOrUndefined(args.article_number),
          textNumber: presentOrUndefined(args.text_number),
          nor: presentOrUndefined(args.nor),
          nature: presentOrUndefined(args.nature),
          idcc: presentOrUndefined(args.idcc),
          atDate: presentOrUndefined(args.at_date),
          includeHistorical: args.include_historical,
          publishedFrom: presentOrUndefined(args.published_from),
          publishedTo: presentOrUndefined(args.published_to),
          page: args.page,
          pageSize: args.page_size,
        };
        const result = await searchLegislation(input, { signal });
        const body = buildSearchLegislationAnswer(result, {
          request,
          collection: args.collection,
          scope: searchScope(args.collection, includeHistorical),
          detailed: args.response_format === 'detailed',
          filteredByArticleNumber: input.articleNumber !== undefined,
        });
        return toolAnswer(searchLegislationOutput, body, ctx);
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
