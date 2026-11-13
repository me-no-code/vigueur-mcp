import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import type { IsoDate } from '../../domain/dates.js';
import { codeUrl, jorfUrl, lodaUrl } from '../../domain/links.js';
import type { ChangesView } from '../../services/legislation/changes.js';
import type { CallContext, ChangeEntry } from '../../services/legislation/ports.js';
import {
  callSignal,
  isoDateSchema,
  MAX_TOOL_TEXT,
  nextPageHint,
  optionalIsoDateSchema,
  pageByBudget,
  presentOrUndefined,
} from '../format.js';
import { toToolError } from '../tool-error.js';

export type ListChanges = (
  input: { code?: string; text?: string; since: IsoDate; until?: IsoDate },
  ctx?: CallContext,
) => Promise<ChangesView>;

const DESCRIPTION =
  'List what changed in a French code, or in a law or decree, between two dates on Légifrance — articles created, amended, repealed, renumbered — grouped by the amending text. Give either "code" (e.g. "Code du travail") or "text" (a law or decree: "loi 78-17", a NOR or a Légifrance id). Dates are entry-into-force dates (not publication dates). Example: what changed in the Code du travail since 2026-01-01.';

const inputSchema = z.object({
  code: z
    .string()
    .optional()
    .describe('Code title, e.g. "Code du travail", "Code civil". Exclusive with "text".'),
  text: z
    .string()
    .optional()
    .describe(
      'A law, ordinance, decree or order: "loi 78-17", "décret 2019-1088", a NOR, or a LEGITEXT/JORFTEXT id. Exclusive with "code".',
    ),
  since: isoDateSchema.describe('Start of the range, YYYY-MM-DD (entry-into-force date).'),
  until: optionalIsoDateSchema.describe('End of the range, YYYY-MM-DD. Default: today.'),
  page: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Page of the change list, 100 entries per page (default 1).'),
});

const ENTRIES_PER_PAGE = 100;
const FRAME_RESERVE = 4_000;

const ACTION_LABELS: Readonly<Record<ChangeEntry['action'], string>> = {
  creation: 'created',
  modification: 'amended',
  abrogation: 'repealed',
  codification: 'codified',
  transfer: 'transferred',
  other: 'linked',
};

export interface ChangesRenderOptions {
  today: IsoDate;
  page: number;
}

/** `target` follows the input: a code → its code page; a text → LODA for a LEGITEXT id, JORF for a JORFTEXT id. */
function headerLink(view: ChangesView): string {
  if (view.target === 'code') return codeUrl(view.textId);
  return view.textId.startsWith('JORFTEXT') ? jorfUrl(view.textId) : lodaUrl(view.textId);
}

function entryLine(e: ChangeEntry, today: IsoDate): string {
  const section = e.sectionTitle === null ? '' : ` (${e.sectionTitle})`;
  const id = e.articleId !== null ? ` · id ${e.articleId}` : '';
  const scheduled = e.date > today ? ' (scheduled)' : '';
  return `- ${e.date} · ${ACTION_LABELS[e.action]} · art. ${e.articleNum ?? '?'}${section}${id}${scheduled}`;
}

/**
 * One page of a change log, 100 entries at most (fewer when the text would pass the cap). Every
 * page repeats the heading and the notes; only the entries are split, group headers repeating.
 */
export function renderListChanges(view: ChangesView, opts: ChangesRenderOptions): string {
  const flat = view.groups.flatMap((g, group) => g.entries.map((entry) => ({ group, entry })));
  const titleCost = (group: number) => (view.groups[group]?.amendingTitle.length ?? 0) + 8;
  const paged = pageByBudget(
    flat,
    opts.page,
    // Counts a group header for every entry: a safe upper bound whatever the page boundaries.
    (i) => entryLine(i.entry, opts.today).length + 1 + titleCost(i.group),
    { maxItems: ENTRIES_PER_PAGE, budget: MAX_TOOL_TEXT - FRAME_RESERVE },
  );

  // The page's entries by amending text (a group continuing from the previous page repeats).
  const pageGroups: Array<{ amendingTitle: string; entries: ChangeEntry[] }> = [];
  const indexes: number[] = [];
  for (const { group, entry } of paged.items) {
    const last = pageGroups.at(-1);
    if (indexes.at(-1) === group && last !== undefined) last.entries.push(entry);
    else {
      pageGroups.push({ amendingTitle: view.groups[group]?.amendingTitle ?? '', entries: [entry] });
      indexes.push(group);
    }
  }
  const header = [
    `### ${view.textTitle} — changes from ${view.since} to ${view.until}`,
    `${view.target === 'code' ? 'Code' : 'Text'}: ${headerLink(view)}`,
    `${view.totalEntries} ${view.totalEntries === 1 ? 'entry' : 'entries'} in ${view.groups.length} amending ${view.groups.length === 1 ? 'text' : 'texts'}, ${view.scheduledCount} scheduled (not yet in force) — page ${opts.page} of ${paged.pageCount}. Dates are entry-into-force dates, not publication dates.`,
  ];
  const body =
    pageGroups.length === 0
      ? ['No change recorded in this range.']
      : pageGroups.map((g) =>
          [`#### ${g.amendingTitle}`, ...g.entries.map((e) => entryLine(e, opts.today))].join('\n'),
        );
  const notes: string[] = [];
  if (view.undeterminedCount > 0) {
    notes.push(
      `${view.undeterminedCount} version${view.undeterminedCount === 1 ? '' : 's'} in this range ${view.undeterminedCount === 1 ? 'has' : 'have'} an entry-into-force date Légifrance leaves undetermined and ${view.undeterminedCount === 1 ? 'is' : 'are'} not listed.`,
    );
  }
  if (view.detailMissingYears.length > 0) {
    notes.push(
      `Légifrance has not loaded the version detail for ${view.detailMissingYears.join(', ')}: changes of ${view.detailMissingYears.length === 1 ? 'that year' : 'those years'} may be missing.`,
    );
  }
  return [...header, ...body, ...notes, ...(paged.hasMore ? [nextPageHint(opts.page)] : [])].join(
    '\n\n',
  );
}

export function registerListChangesTool(
  server: McpServer,
  listChanges: ListChanges,
  today: () => IsoDate,
  deadlineMs?: number,
): void {
  server.registerTool(
    'legifrance_list_changes',
    {
      title: 'List changes to a French code',
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
        const view = await listChanges(
          {
            code: presentOrUndefined(args.code),
            text: presentOrUndefined(args.text),
            since: args.since,
            until: presentOrUndefined(args.until),
          },
          { signal },
        );
        const text = renderListChanges(view, {
          today: today(),
          page: args.page ?? 1,
        });
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        return toToolError(err, signal);
      }
    },
  );
}
