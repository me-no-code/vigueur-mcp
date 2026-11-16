import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { CREDENTIALS_WHERE } from '../config.js';
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

const CONSENT_STEP =
  'Open the consent page ("Cliquez ici pour accéder à la page de consentement"), tick **Légifrance** and **JUDILIBRE**, then click **Validate my ToS choices**.';
const APPLY_STEP =
  'Edit the application, tick **Légifrance** and **JUDILIBRE**, then click **Apply changes** ("Appliquer les modifications"). The boxes turn grey once subscribed; check the **Subscribed APIs** table.';
const ENV_PAIRING_LINE =
  'Sandbox credentials only work with PISTE_ENV=sandbox, production credentials with PISTE_ENV=production.';

export const PISTE_SETUP_GUIDE = `## Set up PISTE access

Vigueur reads French law through PISTE, the French government API portal. Access is free.

1. Create a free account on https://piste.gouv.fr and confirm your email address.
2. Open the **Applications** tab. A **SANDBOX** application already exists; applications you create yourself ("Créer une application") are **production** applications.
3. ${CONSENT_STEP}
4. ${APPLY_STEP}
5. Copy the application's OAuth **client ID** and **client secret**.
6. Enter the three values, then restart Vigueur:
   - \`PISTE_CLIENT_ID\` (plugin setting **PISTE client ID**): the client ID
   - \`PISTE_CLIENT_SECRET\` (**PISTE client secret**): the client secret
   - \`PISTE_ENV\` (**PISTE environment**): \`sandbox\` for the auto-created sandbox application, \`production\` otherwise

   In Claude Code with the Vigueur plugin, enter them with \`/plugin configure vigueur@vigueur\`, then run \`/mcp\`, select **vigueur** and choose **Reconnect**. In another MCP client, set them as environment variables in its configuration, then restart the client.`;

const ENABLE_APIS_GUIDE = `To enable a missing API on your PISTE application (https://piste.gouv.fr, **Applications** tab):

1. ${CONSENT_STEP}
2. ${APPLY_STEP}`;

const UNEXPECTED_PARAGRAPH =
  'PISTE answered the check in a way Vigueur does not expect (possibly an API change); `detail` gives the answer. Try again later; if it persists, report it.';

const UNAVAILABLE_PARAGRAPH =
  'PISTE did not answer; try again in a moment. If it keeps failing, check https://piste.gouv.fr for incidents.';

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
  config_problems: configProblems,
  checks: z.array(checkSchema).describe('One probe per legal source.'),
});

const notConfiguredBranch = answerSchema(SOURCE, 'not_configured', {
  config_problems: configProblems,
  setup_guide: z.string().describe('How to get and set PISTE credentials.'),
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
      setup_guide: PISTE_SETUP_GUIDE,
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
  const states = new Set(report.sources.map((s) => s.state));
  const warnings: string[] = [];
  if (states.has('not_enabled')) warnings.push(ENABLE_APIS_GUIDE);
  if (states.has('credentials_invalid')) {
    warnings.push(
      `PISTE rejected the credentials: check PISTE_CLIENT_ID and PISTE_CLIENT_SECRET.\n${ENV_PAIRING_LINE}\n${CREDENTIALS_WHERE}`,
    );
  }
  if (states.has('unexpected_response')) warnings.push(UNEXPECTED_PARAGRAPH);
  if (states.has('unavailable')) warnings.push(UNAVAILABLE_PARAGRAPH);
  return {
    source: SOURCE,
    outcome: 'results',
    warnings,
    environment: report.env,
    config_problems: report.configProblems,
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
        "Check Vigueur's setup: whether PISTE credentials are configured, which environment is used, and whether each legal source (Légifrance, Judilibre) is reachable and enabled. Returns step-by-step setup instructions for anything missing. Call this first when another Vigueur tool reports a credentials, access or availability problem, or when helping a user install Vigueur.",
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
