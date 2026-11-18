import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import type { GetArticleInput, GetArticleResult } from '../../services/legislation/get-article.js';
import type { CallContext } from '../../services/legislation/ports.js';
import { requestEcho, type ToolContext, toolAnswer } from '../envelope.js';
import {
  callSignal,
  optionalIsoDateSchema,
  presentOrUndefined,
  responseFormatSchema,
} from '../format.js';
import { toolError } from '../tool-error.js';
import { buildGetArticleAnswer } from './get-article-answer.js';
import { getArticleOutput, TOOL } from './get-article-output.js';

export type GetArticle = (input: GetArticleInput, ctx?: CallContext) => Promise<GetArticleResult>;

const DESCRIPTION =
  'Fetch one article of a French code (Code civil, Code du travail…) from Légifrance by citation (code + article number, e.g. code "Code du travail", number "L1234-1") or by Légifrance id (LEGIARTI…, or KALIARTI… for a collective agreement article). Optionally as of a past or future date (at_date, YYYY-MM-DD) — use it to check what applied when a contract was signed or a dispute arose. Returns the official text, whether it is in force on that date (computed from its validity dates), where it sits in the code, its notes, and a link to legifrance.gouv.fr. If the number exists in several codes and no code is given, it lists the candidates instead of guessing. If the article was repealed, replaced or not yet in force on that date, it says so and, when Légifrance records it, where the content moved (e.g. old art. 1382 → 1240 of the Code civil).';

const inputSchema = z.object({
  code: z
    .string()
    .optional()
    .describe(
      'Code title, e.g. "Code civil", "Code du travail" (common abbreviations such as "C. trav." work). Omit to look in every code.',
    ),
  number: z
    .string()
    .optional()
    .describe('Article number as cited, e.g. "1240", "L1234-1", "L. 1234-1", "199 undecies B".'),
  id: z
    .string()
    .optional()
    .describe(
      'Légifrance article id, instead of code + number: LEGIARTI + 12 digits (code or law article) or KALIARTI + 12 digits (collective agreement article).',
    ),
  at_date: optionalIsoDateSchema.describe(
    'Date to read the article at, YYYY-MM-DD (past or future). Default: today.',
  ),
  response_format: responseFormatSchema
    .optional()
    .describe(
      '"concise" (default): text, status, location, notes, link. "detailed": also every version, the amending texts and the citation count.',
    ),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(
      'Continue a truncated article text from this character offset (given in the answer).',
    ),
  include_neighbours: z
    .boolean()
    .optional()
    .describe(
      'true = also give the previous and next article of the same section (number, first words, link). Default false.',
    ),
});

export function registerGetArticleTool(
  server: McpServer,
  getArticle: GetArticle,
  ctx: ToolContext,
): void {
  server.registerTool(
    TOOL,
    {
      title: 'Get a French code article',
      description: DESCRIPTION,
      inputSchema,
      outputSchema: getArticleOutput,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args, extra) => {
      const request = requestEcho(TOOL, inputSchema, args, {
        at_date: ctx.today(),
        response_format: 'concise',
        offset: 0,
        include_neighbours: false,
      });
      const signal = callSignal(extra.mcpReq.signal, ctx.deadlineMs);
      try {
        const id = presentOrUndefined(args.id);
        const input: GetArticleInput = {
          code: presentOrUndefined(args.code),
          number: presentOrUndefined(args.number),
          id,
          atDate: presentOrUndefined(args.at_date),
          ...(args.include_neighbours === true && { includeNeighbours: true }),
        };
        const result = await getArticle(input, { signal });
        const body = buildGetArticleAnswer(result, {
          request,
          detailed: args.response_format === 'detailed',
          today: ctx.today(),
          requestedId: id ?? null,
          offset: args.offset ?? 0,
        });
        return toolAnswer(getArticleOutput, body, ctx);
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
