import type { McpServer } from '@modelcontextprotocol/server';
import type { StatusContext, StatusReport } from '../services/status.js';
import { SOURCE_LABELS } from '../shared/source-id.js';
import { callSignal } from './format.js';
import { toToolError } from './tool-error.js';

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
6. In your MCP client configuration, set these environment variables, then restart the client:
   - \`PISTE_CLIENT_ID\`: the client ID
   - \`PISTE_CLIENT_SECRET\`: the client secret
   - \`PISTE_ENV\`: \`sandbox\` for the auto-created sandbox application, \`production\` otherwise`;

const ENABLE_APIS_GUIDE = `To enable a missing API on your PISTE application (https://piste.gouv.fr, **Applications** tab):

1. ${CONSENT_STEP}
2. ${APPLY_STEP}`;

export function formatStatus(report: StatusReport): string {
  const sections: string[] = [];
  if (report.configProblems.length > 0) {
    sections.push(
      ['Configuration problems:', ...report.configProblems.map((p) => `- ${p}`)].join('\n'),
    );
  }

  if (!report.configured) {
    sections.push('PISTE access is not configured yet.', PISTE_SETUP_GUIDE);
    return sections.join('\n\n');
  }

  const lines = [`Environment: ${report.env}`];
  for (const { source, state, detail, retryAfterSeconds } of report.sources) {
    const label = SOURCE_LABELS[source];
    if (state === 'ok') {
      lines.push(`✅ ${label}: ok`);
      continue;
    }
    const parts: string[] = [];
    if (detail !== undefined)
      parts.push(detail.startsWith(`${label}: `) ? detail.slice(label.length + 2) : detail);
    if (state === 'quota_exceeded' && retryAfterSeconds !== undefined) {
      parts.push(`Retry in about ${retryAfterSeconds} s.`);
    }
    lines.push(`❌ ${label}: ${state}${parts.length > 0 ? ` — ${parts.join(' ')}` : ''}`);
  }
  sections.push(lines.join('\n'));

  const states = new Set(report.sources.map((s) => s.state));
  if (states.has('not_enabled')) sections.push(ENABLE_APIS_GUIDE);
  if (states.has('credentials_invalid')) {
    sections.push(
      `PISTE rejected the credentials: check PISTE_CLIENT_ID and PISTE_CLIENT_SECRET.\n${ENV_PAIRING_LINE}`,
    );
  }
  if (states.has('unavailable')) {
    sections.push(
      'PISTE did not answer; try again in a moment. If it keeps failing, check https://piste.gouv.fr for incidents.',
    );
  }
  return sections.join('\n\n');
}

export function registerStatusTool(
  server: McpServer,
  getStatus: (ctx?: StatusContext) => Promise<StatusReport>,
): void {
  server.registerTool(
    'vigueur_status',
    {
      title: 'Vigueur setup status',
      description:
        "Check Vigueur's setup: whether PISTE credentials are configured, which environment is used, and whether each legal source (Légifrance, Judilibre) is reachable and enabled. Returns step-by-step setup instructions for anything missing. Call this first when another Vigueur tool reports a credentials, access or availability problem, or when helping a user install Vigueur.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (ctx) => {
      const signal = callSignal(ctx.mcpReq.signal);
      try {
        const report = await getStatus({ signal });
        return { content: [{ type: 'text', text: formatStatus(report) }] };
      } catch (err) {
        return toToolError(err);
      }
    },
  );
}
