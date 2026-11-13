import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { judilibreDecisionUrl } from '../../domain/links.js';
import type { JudilibreDecisionResult } from '../../services/case-law/judilibre.js';
import type { CallContext, DecisionZone } from '../../services/case-law/ports.js';
import { VigueurError } from '../../shared/errors.js';
import {
  callSignal,
  cut,
  fitHead,
  MAX_TOOL_TEXT,
  paginateText,
  truncationNotice,
} from '../format.js';
import { toToolError } from '../tool-error.js';
import { identityLine, publicationText } from './search-decisions.js';

export type GetDecision = (
  input: { id: string; zone?: DecisionZone },
  ctx?: CallContext,
) => Promise<JudilibreDecisionResult>;

const DESCRIPTION =
  'Read a decision from Judilibre by its id (given in judilibre_search_decisions results and in the "Attacked decision" line of a decision). Returns the identity, the official link, the formation, publication and outcome, the attacked decision, the Cour de cassation\'s summary, visa and rapprochements when it has them, and the full text verbatim (names pseudonymised by the source). ' +
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

/** How hard the head's lists and summary are cut, fullest first (see `fitHead`). */
const LEVELS = [
  { items: 30, itemMax: 500, summaryMax: 2000 },
  { items: 10, itemMax: 200, summaryMax: 1000 },
  { items: 3, itemMax: 100, summaryMax: 500 },
  { items: 0, itemMax: 0, summaryMax: 200 },
] as const;
type Limits = (typeof LEVELS)[number];

const listLines = (label: string, items: string[], lim: Limits): string[] =>
  items.length === 0
    ? []
    : [
        `${label}:`,
        ...items.slice(0, lim.items).map((i) => `- ${cut(i, lim.itemMax)}`),
        ...(items.length > lim.items ? [`(+${items.length - lim.items} more)`] : []),
      ];

const notFound = (id: string): string =>
  [
    `No Judilibre decision with id "${id}".`,
    'Find decisions with judilibre_search_decisions (a pourvoi number or ECLI works as the query).',
  ].join('\n');

/** One page (`offset`) of a decision: identity, source and, at offset 0, the decision's metadata. */
export function renderDecision(result: JudilibreDecisionResult, offset: number): string {
  if (result.kind === 'not_found') return notFound(result.id);
  const { decision: d, zone, zoneMissing } = result;
  const body = zone?.text ?? d.text;
  if (offset > body.length) {
    throw new VigueurError(
      'invalid_input',
      `"offset" ${offset} is past the end of the text (${body.length} characters).`,
    );
  }
  const heading = `── ${zone === null ? 'Full text' : `Zone: ${zone.name}`} ──`;
  const pointer =
    d.jurisdiction.key === 'cc' && d.ecli
      ? `Same decision on Légifrance (when it holds it, usually weeks later): legifrance_search_case_law with "collection": "judicial" and "ecli": "${d.ecli}".`
      : null;
  const buildHead = (level: number): string => {
    const lim = LEVELS[level] as Limits;
    const head: string[] = [
      identityLine(d),
      `Source: Judilibre · ${judilibreDecisionUrl(d.id)} (official page, constructed link)`,
    ];
    if (offset === 0) {
      const zones = [...new Set(d.zones.map((z) => z.zone))];
      const second = [
        d.formation?.label,
        publicationText(d),
        d.solutionFull ?? d.solution?.label ?? d.solutionText,
      ].filter((p): p is string => Boolean(p));
      head.push(
        ...(second.length > 0 ? [second.join(' · ')] : []),
        ...(d.contested
          ? [
              `Attacked decision: ${d.contested.title.replace(/\s*\n\s*/g, ', ')}${d.contested.date ? `, decision of ${d.contested.date}` : ''}${d.contested.number ? `, n° ${d.contested.number}` : ''}`,
              ...(d.contested.judilibreId
                ? [`Full text: judilibre_get_decision id "${d.contested.judilibreId}"`]
                : []),
            ]
          : []),
        ...(d.summary ? [`Summary (sommaire): ${cut(d.summary, lim.summaryMax)}`] : []),
        ...(d.titles.length > 0 ? [`Titles: ${cut(d.titles.join(' · '), lim.summaryMax)}`] : []),
        ...listLines('Visa', d.visa, lim),
        ...listLines('Rapprochements', d.rapprochements, lim),
        ...listLines(
          'Files',
          d.files.map((f) => `${f.name} · ${f.type} · ${f.url}`),
          lim,
        ),
        zones.length > 0
          ? `Zones: ${zones.join(', ')}`
          : 'No zone markup (common for unpublished decisions): read the full text.',
      );
    }
    if (zoneMissing !== null) {
      head.push(`This decision has no "${zoneMissing}" zone; showing the full text.`);
    }
    head.push(heading);
    return head.join('\n');
  };
  const roomLeft = (head: string): number =>
    MAX_TOOL_TEXT -
    (head.length + 1 + (pointer?.length ?? 0) + 2 + truncationNotice(body.length).length + 4);
  const headText = fitHead(buildHead, LEVELS.length, roomLeft);
  const page = paginateText(body, offset, roomLeft(headText));
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
    'judilibre_get_decision',
    {
      title: 'Read a Judilibre decision',
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
        const result = await getDecision({ id: args.id, zone: args.zone }, { signal });
        return { content: [{ type: 'text', text: renderDecision(result, args.offset ?? 0) }] };
      } catch (err) {
        return toToolError(err, signal, 'judilibre');
      }
    },
  );
}
