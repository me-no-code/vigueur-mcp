import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { LEGIFRANCE_BASE_URL } from '../../domain/links.js';
import type { ReferenceKind, ReferenceView } from '../../services/legislation/jo.js';
import type { CallContext } from '../../services/legislation/ports.js';
import { callSignal, MAX_TOOL_TEXT, optionalIsoDateSchema, presentOrUndefined } from '../format.js';
import { toToolError } from '../tool-error.js';

export type ListReferenceValues = (
  input: { kind: ReferenceKind; since?: string },
  ctx?: CallContext,
) => Promise<ReferenceView>;

const DESCRIPTION =
  'List reference values for other Légifrance tools: "codes" (every French code with its status and id, for the code parameter), "jorf_natures" (kinds of texts published in the Journal officiel, for nature filters), "jorf_emitters" (ministries and authorities that published in the Journal officiel since a date, default one year — names change with governments, so check here before filtering).';

const inputSchema = z.object({
  kind: z
    .enum(['codes', 'jorf_natures', 'jorf_emitters'])
    .describe('Which list: "codes", "jorf_natures" or "jorf_emitters".'),
  since: optionalIsoDateSchema.describe(
    'For jorf_natures and jorf_emitters: start of the publication window, YYYY-MM-DD (publication date). Default: one year ago.',
  ),
});

const KIND_LABELS: Record<ReferenceKind, string> = {
  codes: 'French codes',
  jorf_natures: 'Journal officiel text natures',
  jorf_emitters: 'Journal officiel emitters',
};

const line = (v: ReferenceView['values'][number]): string =>
  v.id !== null
    ? `- ${v.value} · ${v.status ?? 'status n/a'} · id ${v.id}`
    : `- ${v.value} · ${v.count ?? 0} texts`;

/** A reference list, one value per line; cut with a notice should it pass the cap. */
export function renderReferenceValues(view: ReferenceView): string {
  const head =
    view.kind === 'codes'
      ? `### ${KIND_LABELS.codes} — ${view.values.length} codes`
      : `### ${KIND_LABELS[view.kind]} — ${view.values.length} values, texts published since ${view.since} (publication dates)`;
  const lines: string[] = [];
  let used = head.length + 400;
  for (const v of view.values) {
    const l = line(v);
    if (used + l.length + 1 > MAX_TOOL_TEXT) break;
    lines.push(l);
    used += l.length + 1;
  }
  const cut =
    lines.length < view.values.length
      ? [`${view.values.length - lines.length} more values not shown (answer size limit).`]
      : [];
  return [head, lines.join('\n'), ...cut, `Source: ${LEGIFRANCE_BASE_URL}`].join('\n\n');
}

export function registerReferenceValuesTool(
  server: McpServer,
  listReferenceValues: ListReferenceValues,
  deadlineMs?: number,
): void {
  server.registerTool(
    'legifrance_list_reference_values',
    {
      title: 'List Légifrance reference values',
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
        const view = await listReferenceValues(
          { kind: args.kind, since: presentOrUndefined(args.since) },
          { signal },
        );
        return { content: [{ type: 'text', text: renderReferenceValues(view) }] };
      } catch (err) {
        return toToolError(err, signal, 'legifrance');
      }
    },
  );
}
