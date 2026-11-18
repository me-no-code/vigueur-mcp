import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import type { JudilibreDecisionResult } from '../../services/case-law/judilibre.js';
import type { CallContext, DecisionZone } from '../../services/case-law/ports.js';
import { requestEcho, type ToolContext, toolAnswer } from '../envelope.js';
import { callSignal } from '../format.js';
import { toolError } from '../tool-error.js';
import { buildGetDecisionAnswer } from './get-decision-answer.js';
import { getDecisionOutput, TOOL } from './get-decision-output.js';

export type GetDecision = (
  input: { id: string; zone?: DecisionZone },
  ctx?: CallContext,
) => Promise<JudilibreDecisionResult>;

const DESCRIPTION =
  'Read a decision from Judilibre by its id (given in judilibre_search_decisions results and in the "attacked" field of a decision). Returns the identity, the official link, the formation, publication and outcome, the attacked decision, the Cour de cassation\'s summary, visa and rapprochements when it has them, and the full text verbatim (names pseudonymised by the source). ' +
  'Cour de cassation decisions carry zones: "zone" returns one part (introduction, expose, moyens, motivations, dispositif, annexes); a decision without that zone is shown in full. Long texts are paged with "offset". Decisions of the Conseil d\'État, Conseil constitutionnel, CNIL and the financial courts are read with legifrance_get_decision.';

const inputSchema = z.object({
  id: z.string().describe('Judilibre decision id: 24 hexadecimal characters.'),
  zone: z
    .enum(['introduction', 'expose', 'moyens', 'motivations', 'dispositif', 'annexes'])
    .optional()
    .describe('Return only this part of the decision (when the source marks zones).'),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Character offset to continue a long text from; the previous page says which.'),
});

export function registerGetDecisionTool(
  server: McpServer,
  getDecision: GetDecision,
  ctx: ToolContext,
): void {
  server.registerTool(
    TOOL,
    {
      title: 'Read a Judilibre decision',
      description: DESCRIPTION,
      inputSchema,
      outputSchema: getDecisionOutput,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args, extra) => {
      const request = requestEcho(TOOL, inputSchema, args, { offset: 0 });
      const signal = callSignal(extra.mcpReq.signal, ctx.deadlineMs);
      try {
        const result = await getDecision({ id: args.id, zone: args.zone }, { signal });
        const body = buildGetDecisionAnswer(result, { request, offset: args.offset ?? 0 });
        return toolAnswer(getDecisionOutput, body, ctx);
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
