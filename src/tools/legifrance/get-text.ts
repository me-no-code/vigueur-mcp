import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import type {
  GetTextInput,
  GetTextResult,
  TextNature,
} from '../../services/legislation/get-text.js';
import type { CallContext } from '../../services/legislation/ports.js';
import { requestEcho, type ToolContext, toolAnswer } from '../envelope.js';
import { callSignal, optionalIsoDateSchema, presentOrUndefined } from '../format.js';
import { toolError } from '../tool-error.js';
import { buildGetTextAnswer, isJorf } from './get-text-answer.js';
import { getTextOutput, PARTS, type Part, TOOL } from './get-text-output.js';

export type GetText = (input: GetTextInput, ctx?: CallContext) => Promise<GetTextResult>;

const DESCRIPTION =
  'Read a French law, ordinance, decree or order from Légifrance — by Légifrance id (LEGITEXT… consolidated version, JORFTEXT… as published), by NOR, or by nature + number (e.g. nature "loi", number "78-17"). "outline" returns the text\'s title, status, publication and its sections with article counts; "articles" returns the article texts page by page (optionally only one section via section_id). at_date picks the consolidated version in force on that date. Collective agreements (KALI) are not supported here: find them with legifrance_search_legislation.';

const NATURES = [
  'loi',
  'loi_organique',
  'ordonnance',
  'decret',
  'arrete',
] as const satisfies readonly TextNature[];

const DEFAULT_PART: Part = 'outline';
const DEFAULT_PAGE = 1;

const inputSchema = z.object({
  id: z
    .string()
    .optional()
    .describe(
      'Légifrance text id: LEGITEXT + 12 digits (consolidated version) or JORFTEXT + 12 digits (as published in the Journal officiel).',
    ),
  nor: z
    .string()
    .optional()
    .describe('NOR of the text, e.g. "JUSC1522466R" (read as published in the Journal officiel).'),
  nature: z
    .enum(NATURES)
    .optional()
    .describe(
      'Nature of the text, given with "number": loi, loi_organique, ordonnance, decret or arrete.',
    ),
  number: z
    .string()
    .optional()
    .describe('Number of the text, given with "nature", e.g. "78-17", "2016-131".'),
  at_date: optionalIsoDateSchema.describe(
    'Read the consolidated version in force on this date, YYYY-MM-DD. Default: today. Not for a JORFTEXT id or a NOR (read as published).',
  ),
  section_id: z
    .string()
    .optional()
    .describe('A section_id from the outline: only that section (its outline, or its articles).'),
  part: z
    .enum(PARTS)
    .optional()
    .describe(
      '"outline" (default): title, status, publication and the sections with their article counts. "articles": the article texts, page by page.',
    ),
  page: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Page of the outline or of the articles (default 1), as given in the answer.'),
});

export function registerGetTextTool(server: McpServer, getText: GetText, ctx: ToolContext): void {
  server.registerTool(
    TOOL,
    {
      title: 'Read a French law, ordinance or decree',
      description: DESCRIPTION,
      inputSchema,
      outputSchema: getTextOutput,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args, extra) => {
      const today = ctx.today();
      const id = presentOrUndefined(args.id);
      const nor = presentOrUndefined(args.nor);
      // A JORFTEXT id or a NOR is read as published: `at_date` does not apply.
      const readAsPublished = nor !== undefined || (id !== undefined && isJorf(id));
      const request = requestEcho(TOOL, inputSchema, args, {
        ...(!readAsPublished && { at_date: today }),
        part: DEFAULT_PART,
        page: DEFAULT_PAGE,
      });
      const signal = callSignal(extra.mcpReq.signal, ctx.deadlineMs);
      try {
        const input: GetTextInput = {
          id,
          nor,
          nature: args.nature,
          number: presentOrUndefined(args.number),
          atDate: presentOrUndefined(args.at_date),
          sectionCid: presentOrUndefined(args.section_id),
        };
        const result = await getText(input, { signal });
        const body = buildGetTextAnswer(result, {
          request,
          part: args.part ?? DEFAULT_PART,
          page: args.page ?? DEFAULT_PAGE,
          input,
          today,
        });
        return toolAnswer(getTextOutput, body, ctx);
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
