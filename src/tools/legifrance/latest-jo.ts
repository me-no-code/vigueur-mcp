import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { joIssueUrl, jorfUrl } from '../../domain/links.js';
import {
  DEFAULT_ISSUE_COUNT,
  type LatestJoInput,
  type LatestJoView,
} from '../../services/legislation/jo.js';
import type { CallContext } from '../../services/legislation/ports.js';
import {
  type AnswerBody,
  answerSchema,
  legifranceLinkSchema,
  natureSchema,
  nextSchema,
  type Pointer,
  pageSchema,
  publishedSchema,
  requestEcho,
  type ToolContext,
  toolAnswer,
} from '../envelope.js';
import {
  callSignal,
  FRAME_SLACK,
  jsonCost,
  listPage,
  MAX_TOOL_TEXT,
  optionalIsoDateSchema,
  presentOrUndefined,
  WIDE_PAGE,
} from '../format.js';
import { toolError } from '../tool-error.js';

const TOOL = 'legifrance_latest_jo';
const SOURCE = 'Légifrance';

export type LatestJo = (input: LatestJoInput, ctx?: CallContext) => Promise<LatestJoView>;

const DESCRIPTION =
  'Read the latest issues of the Journal officiel (JORF) from Légifrance, or the issue(s) published on a given date, with their table of contents: each published text with its nature (loi, décret, arrêté…), ministry and a link. Filter by nature and/or emitter (ministry or authority, partial names accepted). Dates are publication dates.';

const inputSchema = z.object({
  count: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .describe('How many of the latest issues to read, 1 to 10 (default 1). Ignored with "date".'),
  date: optionalIsoDateSchema.describe(
    'Read the issue(s) published on this date, YYYY-MM-DD (publication date).',
  ),
  nature: z
    .string()
    .optional()
    .describe(
      'Keep only texts of this nature, e.g. "decret", "arrete", "loi". See legifrance_list_reference_values.',
    ),
  emitter: z
    .string()
    .optional()
    .describe(
      'Keep only texts of this ministry or authority; a partial name is enough, e.g. "travail".',
    ),
  page: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Page of the table of contents (default 1), as given in the answer.'),
});

const MAX_ITEMS = 1_000;
const DEFAULT_PAGE = 1;
const LISTED_VALUES = 10;

// ---------------------------------------------------------------------------------------------
// Output schema

const textSchema = z.object({
  id: z.string().describe('Légifrance id of the text (JORFTEXT…).'),
  title: z.string().describe('Title of the text.'),
  nature: natureSchema,
  emitter: z
    .string()
    .nullable()
    .describe('Ministry of the text, else its emitter; null when neither is given.'),
  link: legifranceLinkSchema,
});

const groupSchema = z.object({
  path: z
    .array(z.string())
    .describe(
      'Titles of the issue sections holding the texts, outermost first; empty outside any.',
    ),
  texts: z.array(textSchema).describe('The texts of this group listed on this page.'),
});

const issueSchema = z.object({
  id: z.string().describe('Légifrance id of the issue (JORFCONT…).'),
  number: z.string().nullable().describe('Issue number; null when not given.'),
  title: z.string().describe('Title of the issue.'),
  published: publishedSchema.describe('Publication date of the issue; null when not given.'),
  link: legifranceLinkSchema
    .nullable()
    .describe('Official page of the issue; null when not given.'),
  toc_available: z.boolean().describe('Légifrance gives the issue’s table of contents.'),
  groups: z
    .array(groupSchema)
    .describe(
      'The texts of this page in this issue, by section; empty when there is no table of contents or nothing matches.',
    ),
});

const filterSchema = z.object({
  nature: z.string().nullable().describe('The nature filter applied; null when none.'),
  emitter: z.string().nullable().describe('The emitter filter applied; null when none.'),
  matched_emitters: z
    .array(z.string())
    .describe('The spellings of ministries and emitters the emitter filter matched.'),
});

const jo = {
  issue_count: z.number().int().describe('Issues selected.'),
  results: z.number().int().describe('Texts left after filtering, over all pages and issues.'),
  page: pageSchema,
  next: nextSchema,
  filter: filterSchema.describe('The filters applied to the texts.'),
  items: z
    .array(issueSchema)
    .describe(
      'The issues of this page with their texts, in the order given by Légifrance; an issue continuing from the previous page is repeated.',
    ),
};

const availableSchema = z
  .object({
    natures: z
      .array(z.string())
      .describe('Natures of the selected issues before filtering, most frequent first.'),
    emitters: z
      .array(z.string())
      .describe(
        'Ministries and emitters of the selected issues before filtering, most frequent first.',
      ),
  })
  .describe(
    `The first ${LISTED_VALUES} natures and emitters of the selected issues before filtering.`,
  );

const resultsBranch = answerSchema(SOURCE, 'results', jo);
const noResultsBranch = answerSchema(SOURCE, 'no_results', { ...jo, available: availableSchema });

export const latestJoOutput = z.discriminatedUnion('outcome', [resultsBranch, noResultsBranch]);

// ---------------------------------------------------------------------------------------------
// Answer builder

export type LatestJoAnswer = AnswerBody<z.input<typeof latestJoOutput>>;
type Answer = AnswerBody<z.input<typeof resultsBranch | typeof noResultsBranch>>;
type Issue = Answer['items'][number];

export interface LatestJoAnswerOptions {
  /** The call's `request` (`requestEcho`). */
  request: Pointer;
  page: number;
}

/** What the page is cut by: the texts of each issue, or the issue itself when it has none. */
type Entry =
  | { kind: 'issue'; issue: number }
  | { kind: 'text'; issue: number; group: number; text: Issue['groups'][number]['texts'][number] };

const listed = (values: readonly string[]): string => {
  const shown = values.slice(0, LISTED_VALUES).join('; ');
  return values.length > LISTED_VALUES
    ? `${shown}; … (${values.length - LISTED_VALUES} more)`
    : shown;
};

function warningsOf(view: LatestJoView): string[] {
  const { nature, emitter } = view.filter;
  const filtered = nature !== null || emitter !== null;
  const n = view.issues.length;
  const warnings: string[] = [];
  if (view.totalTexts === 0) {
    if (filtered) {
      warnings.push('No text matches these filters in the selected issue(s).');
      if (view.available.natures.length > 0)
        warnings.push(`Natures available in these issues: ${listed(view.available.natures)}.`);
      if (view.available.emitters.length > 0)
        warnings.push(`Emitters available in these issues: ${listed(view.available.emitters)}.`);
    } else if (n > 0) {
      warnings.push('No text is listed in the selected issue(s).');
    }
  }
  if (n === 0) warnings.push('No Journal officiel issue found.');
  return warnings;
}

/** The issue as the answer lists it, before any text is added. */
function issueOf(view: LatestJoView, index: number): Issue {
  const issue = view.issues[index];
  return {
    id: issue?.id ?? '',
    number: issue?.number ?? null,
    title: issue?.title ?? '',
    published: issue?.publishedOn ?? null,
    link: issue?.eliPath == null ? null : joIssueUrl(issue.eliPath),
    toc_available: issue?.groups != null,
    groups: [],
  };
}

/**
 * One page of Journal officiel issues with their texts, 40 000 characters at most. The page is cut
 * by texts: an issue (and a group) continuing from the previous page is repeated. A page without
 * texts or issues (nothing selected, nothing matching, or past the last page) is `no_results`.
 */
export function buildLatestJoAnswer(
  view: LatestJoView,
  opts: LatestJoAnswerOptions,
): LatestJoAnswer {
  const entries: Entry[] = [];
  view.issues.forEach((issue, i) => {
    // An issue's heading goes with its first text, so no page ends on the heading of an issue
    // whose texts start on the next page; an issue without texts is an entry of its own.
    if (!(issue.groups ?? []).some((g) => g.texts.length > 0)) {
      entries.push({ kind: 'issue', issue: i });
    }
    (issue.groups ?? []).forEach((g, group) => {
      for (const t of g.texts) {
        entries.push({
          kind: 'text',
          issue: i,
          group,
          text: {
            id: t.id,
            title: t.title,
            nature: t.nature,
            emitter: t.ministry ?? t.emitter,
            link: jorfUrl(t.id),
          },
        });
      }
    });
  });
  const groupPath = (e: Entry & { kind: 'text' }) =>
    view.issues[e.issue]?.groups?.[e.group]?.path ?? [];

  const { nature, emitter, matchedEmitters } = view.filter;
  const answer = (
    items: Issue[],
    pageCount: number,
    hasMore: boolean,
    shown: number = opts.page,
  ): Answer => {
    const common = {
      source: SOURCE,
      warnings: warningsOf(view),
      issue_count: view.issues.length,
      results: view.totalTexts,
      page: { number: shown, of: pageCount },
      next: hasMore ? { page: shown + 1 } : null,
      filter: { nature, emitter, matched_emitters: matchedEmitters },
      items,
    } as const;
    const tail = { request: opts.request, cached: [] };
    if (view.totalTexts > 0 && items.length > 0) {
      return { ...common, outcome: 'results', ...tail };
    }
    const available = {
      natures: view.available.natures.slice(0, LISTED_VALUES),
      emitters: view.available.emitters.slice(0, LISTED_VALUES),
    };
    return { ...common, outcome: 'no_results', available, ...tail };
  };

  // The frame is measured with the widest page numbers, whatever page is asked, so pages split alike.
  const frame =
    JSON.stringify({
      ...answer([], WIDE_PAGE, true, WIDE_PAGE),
      request: { ...opts.request, page: WIDE_PAGE },
    }).length + FRAME_SLACK;
  const paged = listPage(
    entries,
    opts.page,
    // An issue head is charged where the issue starts on the page, a group's path where the group does.
    (e, previous) => {
      const head = previous?.issue === e.issue ? 0 : jsonCost({ ...issueOf(view, e.issue) });
      if (e.kind === 'issue') return head;
      const sameGroup =
        previous?.kind === 'text' && previous.issue === e.issue && previous.group === e.group;
      return (
        head +
        jsonCost(e.text) +
        (sameGroup ? 0 : JSON.stringify({ path: groupPath(e), texts: [] }).length)
      );
    },
    { maxItems: MAX_ITEMS, budget: MAX_TOOL_TEXT - frame },
  );

  const items: Issue[] = [];
  let lastIssue: number | undefined;
  let lastGroup: number | undefined;
  for (const e of paged.items) {
    let current = items.at(-1);
    if (lastIssue !== e.issue || current === undefined) {
      current = issueOf(view, e.issue);
      items.push(current);
      lastIssue = e.issue;
      lastGroup = undefined;
    }
    if (e.kind === 'issue') continue;
    const group = current.groups.at(-1);
    if (lastGroup === e.group && group !== undefined) group.texts.push(e.text);
    else current.groups.push({ path: groupPath(e), texts: [e.text] });
    lastGroup = e.group;
  }
  return answer(items, paged.pageCount, paged.hasMore);
}

export function registerLatestJoTool(
  server: McpServer,
  latestJo: LatestJo,
  ctx: ToolContext,
): void {
  server.registerTool(
    TOOL,
    {
      title: 'Read the latest Journal officiel',
      description: DESCRIPTION,
      inputSchema,
      outputSchema: latestJoOutput,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args, extra) => {
      const date = presentOrUndefined(args.date);
      const request = requestEcho(TOOL, inputSchema, args, {
        ...(date === undefined && { count: DEFAULT_ISSUE_COUNT }),
        page: DEFAULT_PAGE,
      });
      const signal = callSignal(extra.mcpReq.signal, ctx.deadlineMs);
      try {
        const view = await latestJo(
          {
            count: args.count,
            date,
            nature: presentOrUndefined(args.nature),
            emitter: presentOrUndefined(args.emitter),
          },
          { signal },
        );
        const body = buildLatestJoAnswer(view, { request, page: args.page ?? DEFAULT_PAGE });
        return toolAnswer(latestJoOutput, body, ctx);
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
