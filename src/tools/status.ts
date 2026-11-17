import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { HEALTH_STATES, type StatusContext, type StatusReport } from '../services/status.js';
import { SOURCE_LABELS } from '../shared/source-id.js';
import {
  type AnswerBody,
  answerSchema,
  requestEcho,
  type ToolContext,
  toolAnswer,
} from './envelope.js';
import { callSignal } from './format.js';
import { toolError } from './tool-error.js';

const TOOL = 'vigueur_status';
const SOURCE = 'PISTE';

const configProblems = z
  .array(z.string())
  .describe('Problems found in the PISTE environment variables, as worded by Vigueur.');

const checkSchema = z.object({
  source: z.enum(['Légifrance', 'Judilibre']).describe('The legal source probed.'),
  state: z
    .enum(HEALTH_STATES)
    .describe(
      'ok: reachable and enabled; not_enabled: the API is not enabled on the PISTE application; credentials_invalid: PISTE rejected the credentials; quota_exceeded: PISTE quota reached; unexpected_response: PISTE answered, but not as Vigueur expects (an HTTP 4xx other than 401, 403 and 429, or a body it cannot read or over 64 MB; possibly an API change); unavailable: no answer in time, a network error or a server error.',
    ),
  detail: z.string().nullable().describe('What the probe reported; null when it reported nothing.'),
  retry_after_seconds: z
    .number()
    .nullable()
    .describe('Seconds PISTE asks to wait before retrying; null when it gave none.'),
});

const resultsBranch = answerSchema(SOURCE, 'results', {
  environment: z
    .enum(['sandbox', 'production'])
    .describe('The PISTE environment the credentials are used on.'),
  checks: z.array(checkSchema).describe('One probe per legal source.'),
});

const notConfiguredBranch = answerSchema(SOURCE, 'not_configured', {
  config_problems: configProblems,
});

export const statusOutput = z.discriminatedUnion('outcome', [resultsBranch, notConfiguredBranch]);

/** The answer body for a status report; `request` is the call's echo. */
export function buildStatusAnswer(
  report: StatusReport,
  opts: { request: { tool: string } },
): AnswerBody<z.input<typeof statusOutput>> {
  if (!report.configured || report.env === null) {
    return {
      source: SOURCE,
      outcome: 'not_configured',
      warnings: [],
      config_problems: report.configProblems,
      request: opts.request,
      cached: [],
    };
  }
  const checks = report.sources.map((s) => {
    const label = SOURCE_LABELS[s.source];
    const detail =
      s.detail === undefined
        ? null
        : s.detail.startsWith(`${label}: `)
          ? s.detail.slice(label.length + 2)
          : s.detail;
    return {
      source: label,
      state: s.state,
      detail,
      retry_after_seconds: s.retryAfterSeconds ?? null,
    };
  });
  return {
    source: SOURCE,
    outcome: 'results',
    warnings: [],
    environment: report.env,
    checks,
    request: opts.request,
    cached: [],
  };
}

export function registerStatusTool(
  server: McpServer,
  getStatus: (ctx?: StatusContext) => Promise<StatusReport>,
  ctx: ToolContext,
): void {
  server.registerTool(
    TOOL,
    {
      title: 'Vigueur setup status',
      description:
        "Check Vigueur's setup: whether PISTE credentials are configured, which PISTE environment is used, and whether each legal source (Légifrance, Judilibre) answers with them and is enabled for the PISTE application. Call this when another Vigueur tool reports a credentials, access or availability problem.",
      outputSchema: statusOutput,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (extra) => {
      const request = requestEcho(TOOL, undefined, {}, {});
      const signal = callSignal(extra.mcpReq.signal, ctx.deadlineMs);
      try {
        const report = await getStatus({ signal });
        return toolAnswer(statusOutput, buildStatusAnswer(report, { request }), ctx);
      } catch (err) {
        return toolError(err, {
          source: 'piste',
          request,
          signal,
          deadlineMs: ctx.deadlineMs,
          now: ctx.now,
        });
      }
    },
  );
}
