import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import type { IsoDate } from '../../domain/dates.js';
import type { ModificationLink } from '../../domain/status-at.js';
import type {
  ArticleView,
  GetArticleInput,
  GetArticleResult,
  RelocationView,
} from '../../services/legislation/get-article.js';
import type { ArticleHit, ArticleRecord, CallContext } from '../../services/legislation/ports.js';
import { VigueurError } from '../../shared/errors.js';
import {
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
import { type GetArticleOutput, getArticleOutputSchema, type TextPage } from './schemas.js';

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

function relocationSentence(r: RelocationView, num: string, asOf: IsoDate, today: IsoDate): string {
  const date = r.successor?.validFrom ?? null;
  const future = date !== null && date > today;
  if (r.movedTo.length > 0) {
    const labels = r.movedTo.map((m) => m.label).join('; ');
    return future
      ? `Content will move — per Légifrance concordance, the text of art. ${num} as of ${asOf} will be at ${labels} from ${date}.`
      : `Content moved — per Légifrance concordance, the text of art. ${num} as of ${asOf} is now at ${labels}${date === null ? '' : ` (since ${date})`}.`;
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
    record.codeTitle === null ? `### Art. ${num}` : `### ${record.codeTitle} — art. ${num}`,
    `${status}${version.rawStatus ? ` (${version.rawStatus})` : ''}`,
  ];
  if (record.sectionPath.length > 0) lines.push(record.sectionPath.join(' › '));
  return lines.join('\n');
}

function trailerOf(a: ArticleView, opts: RenderOptions): string[] {
  const { record } = a;
  const blocks: string[] = [];
  if (record.nota !== null) blocks.push(`Note: ${record.nota}`);
  if (a.relocation !== null) {
    blocks.push(relocationSentence(a.relocation, record.version.number || '?', a.asOf, opts.today));
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
function renderFound(a: ArticleView, opts: RenderOptions): { text: string; textPage: TextPage } {
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
  return {
    text: page(slice.text || '(Légifrance has no text for this version.)', slice.nextOffset),
    textPage: { offset, nextOffset: slice.nextOffset, totalLength: articleText.length },
  };
}

/** The article as structured output: everything but its text. */
function foundOutput(a: ArticleView, textPage: TextPage): GetArticleOutput {
  const { text: _text, ...version } = a.record.version;
  return { kind: 'found', article: { ...a, record: { ...a.record, version } }, textPage };
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

function renderNotInForce(r: Extract<GetArticleResult, { kind: 'not_in_force_at_date' }>): string {
  const lines = [
    `Art. ${r.num}${r.codeTitle === null ? '' : ` of ${r.codeTitle}`} exists but was not in force on ${r.asOf}:`,
    ...r.periods.map(
      (p) =>
        `- ${statusLabel(p)} ${p.validFrom ?? 'unknown'} → ${endCell(p, 'date not yet determined')}${r.codeTitle === null ? ` (${p.codeTitle})` : ''}`,
    ),
    'Call again with an "at_date" inside one of these periods to read that version.',
  ];
  return lines.join('\n');
}

/** The text answer (one page of it, for an article) and the structured output of a result. */
export function renderGetArticle(
  result: GetArticleResult,
  opts: RenderOptions,
): { text: string; output: GetArticleOutput } {
  if (result.kind === 'found') {
    const { text, textPage } = renderFound(result.article, opts);
    return { text, output: foundOutput(result.article, textPage) };
  }
  // Lists of at most a page of hits, periods or suggestions: well under MAX_TOOL_TEXT.
  return { text: renderLookupMiss(result, opts.requestedId), output: result };
}

/**
 * The answer when no single article was found: candidates, not-in-force periods or a miss.
 * Shared with the history tool so both answer a bad citation identically.
 */
export function renderLookupMiss(
  result: Exclude<GetArticleResult, { kind: 'found' }>,
  requestedId: string | null,
): string {
  switch (result.kind) {
    case 'ambiguous':
      return renderAmbiguous(result.num, result.candidates, result.possiblyIncomplete === true);
    case 'not_in_force_at_date':
      return renderNotInForce(result);
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
): void {
  server.registerTool(
    'legifrance_get_article',
    {
      title: 'Get a French code article',
      description: DESCRIPTION,
      inputSchema,
      outputSchema: getArticleOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args, ctx) => {
      try {
        const id = presentOrUndefined(args.id);
        const input: GetArticleInput = {
          code: presentOrUndefined(args.code),
          number: presentOrUndefined(args.number),
          id,
          atDate: presentOrUndefined(args.at_date),
        };
        const result = await getArticle(input, { signal: ctx.mcpReq.signal });
        const { text, output } = renderGetArticle(result, {
          detailed: args.response_format === 'detailed',
          today: today(),
          requestedId: id ?? null,
          offset: args.offset ?? 0,
        });
        return { content: [{ type: 'text', text }], structuredContent: output };
      } catch (err) {
        return toToolError(err);
      }
    },
  );
}
