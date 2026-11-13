import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import type { IsoDate } from '../../domain/dates.js';
import { articleUrlFor } from '../../domain/links.js';
import type { ArticleRef } from '../../domain/relocation.js';
import { coversDate, type ModificationLink } from '../../domain/status-at.js';
import type {
  ArticleView,
  GetArticleInput,
  GetArticleResult,
  Neighbour,
  RelocationView,
} from '../../services/legislation/get-article.js';
import type { ArticleHit, ArticleRecord, CallContext } from '../../services/legislation/ports.js';
import { VigueurError } from '../../shared/errors.js';
import {
  callSignal,
  endCell,
  MAX_TOOL_TEXT,
  optionalIsoDateSchema,
  paginateText,
  presentOrUndefined,
  renderStatusAt,
  responseFormatSchema,
  truncationNotice,
} from '../format.js';
import { toToolError } from '../tool-error.js';

export type GetArticle = (input: GetArticleInput, ctx?: CallContext) => Promise<GetArticleResult>;

const DESCRIPTION =
  'Fetch one article of a French code (Code civil, Code du travail…) from Légifrance by citation (code + article number, e.g. code "Code du travail", number "L1234-1") or by Légifrance id (LEGIARTI…). Optionally as of a past or future date (at_date, YYYY-MM-DD) — use it to check what applied when a contract was signed or a dispute arose. Returns the official text, whether it is in force on that date (computed from its validity dates), where it sits in the code, its notes, and a link to legifrance.gouv.fr. If the number exists in several codes and no code is given, it lists the candidates instead of guessing. If the article was repealed, replaced or not yet in force on that date, it says so and, when Légifrance records it, where the content moved (e.g. old art. 1382 → 1240 of the Code civil).';

const inputSchema = z.object({
  code: z
    .string()
    .optional()
    .describe(
      'Code title, e.g. "Code civil", "Code du travail" (common abbreviations such as "C. trav." work). Omit to look in every code.',
    ),
  number: z
    .string()
    .optional()
    .describe('Article number as cited, e.g. "1240", "L1234-1", "L. 1234-1", "199 undecies B".'),
  id: z
    .string()
    .optional()
    .describe('Légifrance article id (LEGIARTI + 12 digits), instead of code + number.'),
  at_date: optionalIsoDateSchema.describe(
    'Date to read the article at, YYYY-MM-DD (past or future). Default: today.',
  ),
  response_format: responseFormatSchema
    .optional()
    .describe(
      '"concise" (default): text, status, location, notes, link. "detailed": also every version, the amending texts and the citation count.',
    ),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(
      'Continue a truncated article text from this character offset (given in the answer).',
    ),
  include_neighbours: z
    .boolean()
    .optional()
    .describe(
      'true = also give the previous and next article of the same section (number, first words, link). Default false.',
    ),
});

export interface RenderOptions {
  detailed: boolean;
  /** Decides past or future tense for the next version. */
  today: IsoDate;
  /** The id asked for, echoed when no article has it. */
  requestedId: string | null;
  /** Where the page of the article text starts. */
  offset: number;
}

/** Article text pages never shrink below this, however large the frame around them. */
const MIN_TEXT_PAGE = 2_000;

const LINK_LABELS: Readonly<Record<ModificationLink['kind'], string>> = {
  creation: 'Created by',
  modification: 'Amended by',
  abrogation: 'Repealed by',
  codification: 'Codified by',
  other: 'Linked to',
};

const since = (validFrom: IsoDate | null) =>
  validFrom === null ? 'in force' : `in force since ${validFrom}`;
const statusLabel = (v: { status: string; rawStatus?: string }) => v.rawStatus || v.status;

/** A move recorded by Légifrance concordance (a source fact); `what` names the text that moved. */
function movedSentence(
  what: string,
  movedTo: readonly ArticleRef[],
  date: IsoDate | null,
  today: IsoDate,
): string {
  const labels = movedTo.map((m) => m.label).join('; ');
  return date !== null && date > today
    ? `Content will move — per Légifrance concordance, ${what} will be at ${labels} from ${date}.`
    : `Content moved — per Légifrance concordance, ${what} is now at ${labels}${date === null ? '' : ` (since ${date})`}.`;
}

function relocationSentence(r: RelocationView, num: string, asOf: IsoDate, today: IsoDate): string {
  // With no later version, the content left when the found version ended.
  const date = r.successor === null ? r.from.validTo : r.successor.validFrom;
  const future = date !== null && date > today;
  if (r.movedTo.length > 0) {
    return movedSentence(`the text of art. ${num} as of ${asOf}`, r.movedTo, date, today);
  }
  const on = date === null ? '' : ` on ${date}`;
  const change =
    r.change === 'unchanged'
      ? `${future ? 'will stay' : 'stayed'} unchanged in the next version${on}`
      : `${future ? 'will be' : 'was'} ${r.change}${on}`;
  return `The content of this article ${change} (inferred from text comparison).`;
}

function detailedBlocks(record: ArticleRecord): string[] {
  const blocks: string[] = [];
  if (record.versions.length > 0) {
    const rows = record.versions.map((v) => {
      const version = `${v.version || '?'}${v.id === record.version.id ? ' (shown)' : ''}`;
      return `| ${version} | ${statusLabel(v)} | ${v.validFrom ?? 'unknown'} | ${endCell(v)} |`;
    });
    blocks.push(
      [
        '#### Versions',
        '| Version | Status | From | Until |',
        '| --- | --- | --- | --- |',
        ...rows,
      ].join('\n'),
    );
  }
  if (record.modifications.length > 0) {
    const lines = record.modifications.map(
      (m) =>
        `- ${LINK_LABELS[m.kind]} ${m.textTitle}${m.effectiveDate === null ? '' : ` (effective ${m.effectiveDate})`}`,
    );
    blocks.push(['#### Modifications', ...lines].join('\n'));
  }
  const n = record.citationsCount;
  blocks.push(`Cited by ${n} ${n === 1 ? 'text' : 'texts'}`);
  return blocks;
}

function headerOf(a: ArticleView): string {
  const { record } = a;
  const { version } = record;
  const num = version.number || '?';
  const status = renderStatusAt(a.statusAt, a.asOf, {
    validToUndetermined: version.validToUndetermined,
  });
  const lines = [
    record.textTitle === null ? `### Art. ${num}` : `### ${record.textTitle} — art. ${num}`,
    `${status}${version.rawStatus ? ` (${version.rawStatus})` : ''}`,
  ];
  if (record.sectionPath.length > 0) lines.push(record.sectionPath.join(' › '));
  return lines.join('\n');
}

/**
 * One neighbour on one line: the excerpt's line breaks and runs of spaces become single spaces;
 * "…" marks an excerpt cut short of the article's text.
 */
function neighbourLine(label: string, n: Neighbour | null): string {
  if (n === null) return `- ${label}: none`;
  const excerpt = n.excerpt.replace(/\s+/g, ' ').trim();
  return `- ${label}: art. ${n.num || '?'} — ${excerpt}${n.truncated ? '…' : ''} · ${n.url}`;
}

function trailerOf(a: ArticleView, opts: RenderOptions): string[] {
  const { record } = a;
  const blocks: string[] = [];
  if (record.nota !== null) blocks.push(`Note: ${record.nota}`);
  if (a.relocation !== null) {
    blocks.push(relocationSentence(a.relocation, record.version.number || '?', a.asOf, opts.today));
  }
  // Best effort: a neighbour that could not be read is `none` here and explained in the warnings.
  if (a.neighbours !== undefined) {
    blocks.push(
      [
        '#### Neighbouring articles',
        neighbourLine('Previous', a.neighbours.previous),
        neighbourLine('Next', a.neighbours.next),
      ].join('\n'),
    );
  }
  if (a.warnings.length > 0) blocks.push(a.warnings.map((w) => `⚠️ ${w}`).join('\n'));
  if (opts.detailed) blocks.push(...detailedBlocks(record));
  blocks.push(`Source: ${a.url}\nLégifrance id: ${record.version.id}`);
  return blocks;
}

/**
 * One page of a found article: only the article text is paginated. Every page repeats the
 * header (heading, status, location) and the trailer (note, relocation, warnings, source), so
 * the in-force verdict and the link travel with every part of the text.
 */
function renderFound(a: ArticleView, opts: RenderOptions): string {
  const articleText = a.record.version.text;
  const { offset } = opts;
  if (offset > 0 && offset >= articleText.length) {
    throw new VigueurError(
      'invalid_input',
      `"offset" ${offset} is past the end of the article text (${articleText.length} characters). Call again without "offset".`,
    );
  }
  const header = headerOf(a);
  const trailer = trailerOf(a, opts);
  const page = (slice: string, nextOffset: number | null) =>
    [
      header,
      ...(offset > 0 ? [`(continued from character ${offset})`] : []),
      slice,
      ...(nextOffset === null ? [] : [truncationNotice(nextOffset)]),
      ...trailer,
    ].join('\n\n');

  // The frame with the longest possible notice: what is left of the budget is for the text.
  const frame = page('', articleText.length).length;
  const slice = paginateText(articleText, offset, Math.max(MIN_TEXT_PAGE, MAX_TOOL_TEXT - frame));
  return page(slice.text || '(Légifrance has no text for this version.)', slice.nextOffset);
}

function renderAmbiguous(num: string, candidates: ArticleHit[], incomplete: boolean): string {
  const codes = new Set(candidates.map((c) => c.codeTitle));
  const lines: string[] = [];
  if (codes.size === 1) {
    // Several versions in force in one code: only the id can tell them apart.
    lines.push(
      `Article ${num} has several versions in force in ${candidates[0]?.codeTitle} — call again with "id":`,
      ...candidates.map(
        (c) => `- ${c.id} (${since(c.validFrom)}${c.rawStatus ? `, ${c.rawStatus}` : ''})`,
      ),
    );
  } else {
    const withIds = codes.size < candidates.length;
    lines.push(
      `Article ${num} exists in several codes — call again with "code":`,
      ...candidates.map(
        (c) => `- ${c.codeTitle} (${since(c.validFrom)})${withIds ? ` · id ${c.id}` : ''}`,
      ),
    );
    if (withIds) lines.push('Some codes have several versions in force: for those, give the "id".');
  }
  if (incomplete)
    lines.push('(Only the first matches are listed — give the code to narrow it down.)');
  return lines.join('\n');
}

function renderNotInForce(
  r: Extract<GetArticleResult, { kind: 'not_in_force_at_date' }>,
  today: IsoDate,
): string {
  const article = `Art. ${r.num}${r.codeTitle === null ? '' : ` of ${r.codeTitle}`}`;
  // When a period's dates cover the date, the dated search and the dates disagree: say only
  // what the search found (a warning names the period), never "was not in force".
  const heading = r.periods.some((p) => coversDate(p, r.asOf))
    ? `${article}: Légifrance's dated search found no version in force on ${r.asOf}. Versions on record:`
    : `${article} exists but was not in force on ${r.asOf}:`;
  const moved = r.relocation;
  const lines = [
    heading,
    ...r.periods.map(
      (p) =>
        `- ${statusLabel(p)} ${p.validFrom ?? 'unknown'} → ${endCell(p, 'date not yet determined')}${r.codeTitle === null ? ` (${p.codeTitle})` : ''} · id ${p.id} · ${articleUrlFor(p.id)}`,
    ),
    ...(moved === undefined
      ? []
      : [
          movedSentence(
            `the text of art. ${r.num} (version ${moved.from.validFrom ?? 'unknown'} → ${endCell(moved.from)})`,
            moved.movedTo,
            moved.from.validTo,
            today,
          ),
        ]),
    ...r.warnings.map((w) => `⚠️ ${w}`),
    'Call again with an "at_date" inside one of these periods to read that version.',
  ];
  return lines.join('\n');
}

/** The text answer (one page of it, for an article). */
export function renderGetArticle(result: GetArticleResult, opts: RenderOptions): string {
  if (result.kind === 'found') return renderFound(result.article, opts);
  // Lists of at most a page of hits, periods or suggestions: well under MAX_TOOL_TEXT.
  return renderLookupMiss(result, opts);
}

/**
 * The answer when no single article was found: candidates, not-in-force periods or a miss.
 * Shared with the history tool so both answer a bad citation identically.
 */
export function renderLookupMiss(
  result: Exclude<GetArticleResult, { kind: 'found' }>,
  opts: { requestedId: string | null; today: IsoDate },
): string {
  const { requestedId } = opts;
  switch (result.kind) {
    case 'ambiguous':
      return renderAmbiguous(result.num, result.candidates, result.possiblyIncomplete === true);
    case 'not_in_force_at_date':
      return renderNotInForce(result, opts.today);
    case 'not_found':
      switch (result.reason) {
        case 'unknown_id':
          return `No Légifrance article with id ${requestedId ?? '?'}.`;
        case 'no_article':
          return `No article ${result.num} in ${result.codeTitle ?? 'any code'} on Légifrance.`;
        case 'unknown_code':
          return [
            `Unknown code "${result.codeTitle}": no Légifrance code has this title. Use the full title (e.g. "Code de la route") or omit the code.`,
            ...(result.didYouMean.length > 0
              ? [
                  `Did you mean: ${result.didYouMean.join('; ')}? (suggestions only — call again with the exact code title)`,
                ]
              : []),
          ].join('\n');
      }
  }
}

export function registerGetArticleTool(
  server: McpServer,
  getArticle: GetArticle,
  today: () => IsoDate,
  deadlineMs?: number,
): void {
  server.registerTool(
    'legifrance_get_article',
    {
      title: 'Get a French code article',
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
        const id = presentOrUndefined(args.id);
        const input: GetArticleInput = {
          code: presentOrUndefined(args.code),
          number: presentOrUndefined(args.number),
          id,
          atDate: presentOrUndefined(args.at_date),
          ...(args.include_neighbours === true && { includeNeighbours: true }),
        };
        const result = await getArticle(input, { signal });
        const text = renderGetArticle(result, {
          detailed: args.response_format === 'detailed',
          today: today(),
          requestedId: id ?? null,
          offset: args.offset ?? 0,
        });
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        return toToolError(err, signal, 'legifrance');
      }
    },
  );
}
