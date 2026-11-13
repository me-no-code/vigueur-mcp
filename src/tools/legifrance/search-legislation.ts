import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import type { IsoDate } from '../../domain/dates.js';
import { articleUrlFor, jorfUrl, kaliUrl, lodaUrl } from '../../domain/links.js';
import type {
  CallContext,
  LegislationHit,
  LegislationSearchPage,
} from '../../services/legislation/ports.js';
import type { SearchLegislationInput } from '../../services/legislation/search.js';
import {
  callSignal,
  MAX_TOOL_TEXT,
  nextPageHint,
  optionalIsoDateSchema,
  presentOrUndefined,
  responseFormatSchema,
} from '../format.js';
import { toToolError } from '../tool-error.js';

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
      'true = return every version, whatever its dates (at_date is then ignored). No effect on "jorf".',
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

const SNIPPET_CONCISE = 200;

const clip = (s: string, max: number) =>
  s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;

function hitUrl(hit: LegislationHit): string {
  if (hit.kind === 'article') return articleUrlFor(hit.id);
  if (hit.id.startsWith('JORFTEXT')) return jorfUrl(hit.id);
  if (hit.id.startsWith('KALITEXT')) return kaliUrl(hit.id);
  return lodaUrl(hit.id);
}

/** Article ids `legifrance_get_article` reads (a JORF article is read on its JO page). */
const READABLE_ARTICLE = /^(?:LEGIARTI|KALIARTI)/;

/** The hit line always carries the official link; then the snippet, if any. */
function hitLines(hit: LegislationHit, snippet: string | null): string {
  const art = hit.articleNumber === null ? '' : ` — art. ${hit.articleNumber}`;
  const dates = `${hit.validFrom ?? '?'} → ${hit.validTo ?? 'no end'}`;
  const lines = [
    `- ${hit.title}${art} · ${hit.rawStatus || hit.status} · ${dates} · id ${hit.id} · ${hitUrl(hit)}`,
  ];
  if (snippet !== null) lines.push(`  ${snippet}`);
  return lines.join('\n');
}

export interface SearchRenderOptions {
  detailed: boolean;
  /** What was asked, one line, repeated on every page (e.g. `collection codes · code "Code civil"`). */
  asked: string;
  /** An article number filter was given: totals can exceed the hits shown. */
  filteredByArticleNumber: boolean;
}

/** The text of a page of hits. */
export function renderSearch(result: LegislationSearchPage, opts: SearchRenderOptions): string {
  const { detailed } = opts;
  const hasMore = result.page * result.pageSize < result.total;
  const textSnippet = (h: LegislationHit) =>
    h.snippet === null || detailed ? h.snippet : clip(h.snippet, SNIPPET_CONCISE);

  const header = [
    `${result.total} ${result.total === 1 ? 'result' : 'results'} — page ${result.page}`,
    opts.asked,
  ];
  if (opts.filteredByArticleNumber) {
    header.push('(Counts include texts filtered out by the article number; showing matches only.)');
  }
  const readable = result.hits.some((h) => h.kind === 'article' && READABLE_ARTICLE.test(h.id));
  const footer = [
    ...(hasMore ? [nextPageHint(result.page)] : []),
    ...(readable
      ? ['Use legifrance_get_article with a hit id to read the full text of an article.']
      : []),
  ];
  const reserve = [...header, ...footer].join('\n').length + 200;

  let shown = 0;
  const lines: string[] = [];
  let used = reserve;
  for (const hit of result.hits) {
    const line = hitLines(hit, textSnippet(hit));
    if (shown > 0 && used + line.length + 1 > MAX_TOOL_TEXT) break;
    shown += 1;
    lines.push(line);
    used += line.length + 1;
  }
  if (shown < result.hits.length) {
    footer.unshift(
      `(Only the first ${shown} of ${result.hits.length} hits of this page fit — use a smaller "page_size".)`,
    );
  }
  const body = lines.length === 0 ? ['No results.'] : lines;
  return [...header, ...body, ...footer].join('\n');
}

/** What each collection's results really are: only codes and loda filter by date. */
function scopeOf(args: SearchArgs, today: IsoDate): string {
  if (args.collection === 'jorf') return 'as published';
  if (args.include_historical) return 'all versions';
  if (args.collection === 'kali') return 'currently in force (extended or not)';
  return `in force on ${presentOrUndefined(args.at_date) ?? today}`;
}

type SearchArgs = z.infer<typeof inputSchema>;

/** The header line repeating what was searched, and in which scope. */
export function askedLine(args: SearchArgs, today: IsoDate): string {
  const given: Array<[string, string | undefined]> = [
    ['query', presentOrUndefined(args.query)],
    ['code', presentOrUndefined(args.code)],
    ['article', presentOrUndefined(args.article_number)],
    ['text number', presentOrUndefined(args.text_number)],
    ['NOR', presentOrUndefined(args.nor)],
    ['nature', presentOrUndefined(args.nature)],
    ['IDCC', presentOrUndefined(args.idcc)],
    ['published from', presentOrUndefined(args.published_from)],
    ['published to', presentOrUndefined(args.published_to)],
  ];
  const criteria = given.filter(([, v]) => v !== undefined).map(([k, v]) => `${k} "${v}"`);
  return `Searched ${args.collection}${criteria.length > 0 ? ` · ${criteria.join(' · ')}` : ''} · ${scopeOf(args, today)}`;
}

export function registerSearchLegislationTool(
  server: McpServer,
  searchLegislation: SearchLegislation,
  today: () => IsoDate,
  deadlineMs?: number,
): void {
  server.registerTool(
    'legifrance_search_legislation',
    {
      title: 'Search French legislation',
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
        const text = renderSearch(result, {
          detailed: args.response_format === 'detailed',
          asked: askedLine(args, today()),
          filteredByArticleNumber: input.articleNumber !== undefined,
        });
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        return toToolError(err, signal);
      }
    },
  );
}
