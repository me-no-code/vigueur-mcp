import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { decisionUrl } from '../../domain/links.js';
import {
  LEGIFRANCE_CASE_LAW_COVERAGE_NOTE,
  type LegifranceDecisionResult,
} from '../../services/case-law/legifrance.js';
import type { CallContext, LegifranceDecision } from '../../services/case-law/ports.js';
import { VigueurError } from '../../shared/errors.js';
import { callSignal, MAX_TOOL_TEXT, paginateText, truncationNotice } from '../format.js';
import { toToolError } from '../tool-error.js';

export type GetDecision = (
  input: { id: string },
  ctx?: CallContext,
) => Promise<LegifranceDecisionResult>;

const DESCRIPTION =
  'Read a decision from Légifrance by its id (JURITEXT, CETATEXT, CONSTEXT, CNILTEXT or JUFITEXT followed by 12 digits, as given in legifrance_search_case_law results). ' +
  'Returns the identity, the official link, the nature, publication and outcome as Légifrance records them, the attacked decision when stated, the summary (sommaire) when there is one, and the full text verbatim (names pseudonymised by the source). ' +
  'Conseil constitutionnel decisions also give the Conseil constitutionnel page and the Journal officiel link; CNIL deliberations the status as Légifrance labels it. Long texts are paged with "offset". ' +
  'A Cour de cassation decision with an ECLI ends with the matching Judilibre search; Judilibre decisions (24 hexadecimal characters) are read with judilibre_get_decision.';

const inputSchema = z.object({
  id: z
    .string()
    .describe('Légifrance decision id, e.g. JURITEXT000053197030 (prefix + 12 digits).'),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Character offset to continue a long text from; the previous page says which.'),
});

const SUMMARY_MAX = 2000;
const TITLE_MAX = 300;
const cut = (s: string, max: number): string =>
  s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;

const notFound = (id: string): string =>
  [
    `No Légifrance decision with id "${id}".`,
    'Find decisions with legifrance_search_case_law.',
    ...(id.startsWith('JURITEXT') ? [LEGIFRANCE_CASE_LAW_COVERAGE_NOTE] : []),
  ].join('\n');

function identityLine(d: LegifranceDecision): string {
  if (d.court === null && d.decisionDate === null) return d.title;
  return [
    [d.court, d.chamber].filter(Boolean).join(', '),
    ...(d.decisionDate ? [`decision of ${d.decisionDate}`] : []),
    ...(d.numbers.length > 0 ? [`n° ${d.numbers.join(', ')}`] : []),
    ...(d.ecli ? [d.ecli] : []),
  ]
    .filter((p) => p !== '')
    .join(' — ');
}

/** One page (`offset`) of a decision: identity, source and, at offset 0, the decision's metadata. */
export function renderDecision(result: LegifranceDecisionResult, offset: number): string {
  if (result.kind === 'not_found') return notFound(result.id);
  const d = result.decision;
  if (offset > d.text.length) {
    throw new VigueurError(
      'invalid_input',
      `"offset" ${offset} is past the end of the text (${d.text.length} characters).`,
    );
  }
  const head: string[] = [
    identityLine(d),
    `Source: Légifrance · ${decisionUrl(d.id)} (official page, constructed link)`,
  ];
  if (offset === 0) {
    // CNIL and Conseil constitutionnel decisions have no court-style identity: their title says what they are.
    const subject = d.collection === 'cnil' || d.collection === 'constitutional';
    const labels = [d.nature, d.publication, d.solution].filter((p): p is string => Boolean(p));
    head.push(
      ...(subject ? [`Title: ${cut(d.title, TITLE_MAX)}`] : []),
      ...(labels.length > 0 ? [labels.join(' · ')] : []),
      ...(d.attacked
        ? [
            `Attacked decision: ${d.attacked.court}${d.attacked.date ? `, decision of ${d.attacked.date}` : ''}`,
          ]
        : []),
      ...(d.constitutionalCouncilUrl
        ? [`Conseil constitutionnel page: ${d.constitutionalCouncilUrl}`]
        : []),
      ...(d.joUrl ? [`Published in the Journal officiel: ${d.joUrl}`] : []),
      ...(d.labelledStatus
        ? [
            `Status as labelled by Légifrance: ${d.labelledStatus}${d.publishedOn ? ` · published ${d.publishedOn}` : ''}`,
          ]
        : []),
      ...(d.summary ? [`Summary (sommaire): ${cut(d.summary, SUMMARY_MAX)}`] : []),
    );
  }
  head.push('── Text ──');
  const pointer =
    d.collection === 'judicial' && d.ecli
      ? `Same decision on Judilibre (usually earlier, with zones): judilibre_search_decisions with "query": "${d.ecli}".`
      : null;
  const headText = head.join('\n');
  const reserved =
    headText.length + 1 + (pointer?.length ?? 0) + 2 + truncationNotice(d.text.length).length + 4;
  const page = paginateText(d.text, offset, MAX_TOOL_TEXT - reserved);
  return [
    headText,
    page.text,
    ...(page.nextOffset === null ? [] : [truncationNotice(page.nextOffset)]),
    ...(pointer !== null && page.nextOffset === null ? [pointer] : []),
  ].join('\n');
}

export function registerGetDecisionTool(
  server: McpServer,
  getDecision: GetDecision,
  deadlineMs?: number,
): void {
  server.registerTool(
    'legifrance_get_decision',
    {
      title: 'Read a Légifrance decision',
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
        const result = await getDecision({ id: args.id }, { signal });
        return { content: [{ type: 'text', text: renderDecision(result, args.offset ?? 0) }] };
      } catch (err) {
        return toToolError(err, signal, 'legifrance');
      }
    },
  );
}
