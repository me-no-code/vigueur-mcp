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
import type { ArticleHit, CallContext } from '../../services/legislation/ports.js';
import { VigueurError } from '../../shared/errors.js';
import {
  type AnswerBody,
  answerSchema,
  dateSchema,
  fromSchema,
  legifranceLinkSchema,
  legifranceStatusSchema,
  nextSchema,
  type Pointer,
  partSchema,
  pointerSchema,
  requestEcho,
  statusSchema,
  statusValue,
  type ToolContext,
  toolAnswer,
  untilSchema,
  untilUndeterminedSchema,
} from '../envelope.js';
import {
  callSignal,
  FRAME_SLACK,
  MAX_TOOL_TEXT,
  optionalIsoDateSchema,
  presentOrUndefined,
  responseFormatSchema,
  sliceForJson,
} from '../format.js';
import { toolError } from '../tool-error.js';

export type GetArticle = (input: GetArticleInput, ctx?: CallContext) => Promise<GetArticleResult>;

const TOOL = 'legifrance_get_article';
const SOURCE = 'Légifrance';

const DESCRIPTION =
  'Fetch one article of a French code (Code civil, Code du travail…) from Légifrance by citation (code + article number, e.g. code "Code du travail", number "L1234-1") or by Légifrance id (LEGIARTI…, or KALIARTI… for a collective agreement article). Optionally as of a past or future date (at_date, YYYY-MM-DD) — use it to check what applied when a contract was signed or a dispute arose. Returns the official text, whether it is in force on that date (computed from its validity dates), where it sits in the code, its notes, and a link to legifrance.gouv.fr. If the number exists in several codes and no code is given, it lists the candidates instead of guessing. If the article was repealed, replaced or not yet in force on that date, it says so and, when Légifrance records it, where the content moved (e.g. old art. 1382 → 1240 of the Code civil).';

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
    .describe(
      'Légifrance article id, instead of code + number: LEGIARTI + 12 digits (code or law article) or KALIARTI + 12 digits (collective agreement article).',
    ),
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

// ---------------------------------------------------------------------------------------------
// Output schema

const candidateSchema = z.object({
  id: z.string().describe('Légifrance id of the article version.'),
  code: z.string().describe('Title of the code the version belongs to.'),
  code_id: z.string().describe('Légifrance id of that code.'),
  from: fromSchema,
  legifrance_status: legifranceStatusSchema,
  read_with: pointerSchema.describe('The tool call that returns this version.'),
});

/**
 * The answers when no single article was found, shared with `legifrance_get_article_history`:
 * several matching versions (`several_matches`) or none (`not_found`).
 */
export const lookupMissBranches = [
  answerSchema(SOURCE, 'several_matches', {
    number: z.string().describe('The article number looked up.'),
    code: z
      .string()
      .nullable()
      .describe('The code every candidate belongs to; null when they span several codes.'),
    candidates: z.array(candidateSchema).describe('The article versions matching the citation.'),
    incomplete: z
      .boolean()
      .describe('Légifrance returned a full page of matches: more candidates may exist.'),
  }),
  answerSchema(SOURCE, 'not_found', {
    reason: z
      .enum(['unknown_id', 'no_article', 'unknown_code'])
      .describe(
        'unknown_id: no article has the id; no_article: no version of the number is on record; unknown_code: no code has the given title, so nothing was searched.',
      ),
    id: z.string().nullable().describe('The article id looked up; null when none was given.'),
    number: z.string().nullable().describe('The article number looked up; null for an id.'),
    code: z
      .string()
      .nullable()
      .describe(
        'The code as given (unknown_code), else its official title; null when every code was searched.',
      ),
    did_you_mean: z
      .array(z.string())
      .describe(
        'Code titles containing the given code (unknown_code); none was used in its place.',
      ),
  }),
] as const;

const neighbourSchema = z
  .object({
    number: z.string().describe('Article number.'),
    id: z.string().describe('Légifrance id of the article version.'),
    excerpt: z.string().describe('The start of its text.'),
    excerpt_cut: z.boolean().describe('Its text is longer than the excerpt.'),
    link: legifranceLinkSchema,
  })
  .nullable()
  .describe('null when there is none, or when it could not be read (a warning then says why).');

const versionRowSchema = z.object({
  id: z.string().describe('Légifrance id of the version.'),
  version: z.string().describe("Légifrance's version number."),
  legifrance_status: legifranceStatusSchema,
  from: fromSchema,
  until: untilSchema,
  until_undetermined: untilUndeterminedSchema,
  shown: z.boolean().describe('This is the version of this answer.'),
});

const MODIFICATION_ACTIONS: Readonly<
  Record<ModificationLink['kind'], 'created' | 'amended' | 'repealed' | 'codified' | 'linked'>
> = {
  creation: 'created',
  modification: 'amended',
  abrogation: 'repealed',
  codification: 'codified',
  other: 'linked',
};

const modificationSchema = z.object({
  action: z.enum(['created', 'amended', 'repealed', 'codified', 'linked']),
  by: z.string().describe('Title of the text.'),
  effective: dateSchema.nullable().describe('Date the change took effect; null when not given.'),
});

const foundBranch = answerSchema(SOURCE, 'found', {
  id: z.string().describe('Légifrance id of the article version.'),
  link: z.string().describe('Official page of the version on legifrance.gouv.fr.'),
  status: statusSchema,
  legifrance_status: legifranceStatusSchema,
  code: z.string().nullable().describe('Title of the code; null when Légifrance gives none.'),
  code_id: z.string().nullable().describe('Légifrance id of the code; null when not given.'),
  number: z.string().describe('Article number.'),
  section: z
    .array(z.string())
    .describe('Titles of the sections holding the article, outermost first, as of `status.on`.'),
  section_id: z
    .string()
    .nullable()
    .describe('Légifrance id of the section holding the article; null when not given.'),
  note: z.string().nullable().describe("Légifrance's note on the article; null when none."),
  relocation: z
    .string()
    .nullable()
    .describe(
      'Where the content of this version went per Légifrance concordance, or whether the next version has the same wording (identical but for typography); null when neither is recorded.',
    ),
  neighbours: z
    .object({ previous: neighbourSchema, next: neighbourSchema })
    .nullable()
    .describe(
      'The articles before and after this one in its section, in force on `status.on`; null when not asked for.',
    ),
  versions: z
    .array(versionRowSchema)
    .nullable()
    .describe('Every version of the article; null in a concise answer.'),
  modifications: z
    .array(modificationSchema)
    .nullable()
    .describe('Texts that created, amended or repealed this version; null in a concise answer.'),
  cited_by: z
    .number()
    .int()
    .nullable()
    .describe('Number of texts citing the article; null in a concise answer.'),
  part: partSchema.nullable().describe('The characters of the text shown; null when it is whole.'),
  next: nextSchema,
  text: z
    .string()
    .describe('The official text of the version (the part shown); empty when Légifrance has none.'),
});

const notInForceBranch = answerSchema(SOURCE, 'not_in_force', {
  number: z.string().describe('The article number looked up.'),
  code: z
    .string()
    .nullable()
    .describe(
      'The code asked for, else the code every period shares; null when they span several.',
    ),
  on: dateSchema.describe('The date looked up.'),
  periods: z
    .array(
      z.object({
        id: z.string().describe('Légifrance id of the version.'),
        code: z.string().describe('Title of the code the version belongs to.'),
        legifrance_status: legifranceStatusSchema,
        from: fromSchema,
        until: untilSchema,
        until_undetermined: untilUndeterminedSchema,
        link: z.string().describe('Official page of the version on legifrance.gouv.fr.'),
      }),
    )
    .describe('The versions on record with this number, oldest first (unknown starts last).'),
  relocation: z
    .string()
    .nullable()
    .describe('Where the content of the latest period went; null when none is recorded.'),
  incomplete: z
    .boolean()
    .describe('Légifrance returned a full page of versions: more versions may exist.'),
});

export const getArticleOutput = z.discriminatedUnion('outcome', [
  foundBranch,
  notInForceBranch,
  ...lookupMissBranches,
]);

// ---------------------------------------------------------------------------------------------
// Answer builder

export type GetArticleAnswer = AnswerBody<z.input<typeof getArticleOutput>>;
type FoundAnswer = AnswerBody<z.input<typeof foundBranch>>;
type NotInForceAnswer = AnswerBody<z.input<typeof notInForceBranch>>;
export type LookupMissAnswer = AnswerBody<z.input<(typeof lookupMissBranches)[number]>>;

/** A lookup that found no single article: several candidates, or none. */
export type LookupMiss = Extract<GetArticleResult, { kind: 'ambiguous' | 'not_found' }>;

export interface LookupMissOptions {
  /** The call's `request` (`requestEcho`). */
  request: Pointer;
  /** The id asked for, echoed when no article has it. */
  requestedId: string | null;
}

export interface GetArticleAnswerOptions extends LookupMissOptions {
  detailed: boolean;
  /** Decides past or future tense for where the content moved. */
  today: IsoDate;
  /** Where the page of the article text starts. */
  offset: number;
}

const labelOf = (rawStatus: string | undefined): string | null => rawStatus || null;

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

function relocationSentence(
  r: RelocationView,
  num: string,
  asOf: IsoDate,
  today: IsoDate,
): string | null {
  // With no later version, the content left when the found version ended.
  const date = r.successor === null ? r.from.validTo : r.successor.validFrom;
  if (r.movedTo.length > 0) {
    return movedSentence(`the text of art. ${num} as of ${asOf}`, r.movedTo, date, today);
  }
  if (r.successor === null || r.sameWording === null) return null;
  const when = date === null ? '' : `in force from ${date}, `;
  const wording = r.sameWording ? 'the same wording' : 'a different wording';
  return `The next version (${when}id ${r.successor.id}) has ${wording}.`;
}

function neighbourValue(n: Neighbour | null) {
  return n === null
    ? null
    : { number: n.num, id: n.id, excerpt: n.excerpt, excerpt_cut: n.truncated, link: n.url };
}

/**
 * One page of a found article: only the text is cut; every page carries every other field, so
 * the status and the link travel with every part of the text.
 */
function foundAnswer(a: ArticleView, opts: GetArticleAnswerOptions): FoundAnswer {
  const { record } = a;
  const { version } = record;
  const fullText = version.text;
  const { offset } = opts;
  if (offset > 0 && offset >= fullText.length) {
    throw new VigueurError(
      'invalid_input',
      `"offset" ${offset} is past the end of the article text (${fullText.length} characters). Call again without "offset".`,
    );
  }
  const page = (
    text: string,
    part: FoundAnswer['part'],
    next: FoundAnswer['next'],
  ): FoundAnswer => ({
    source: SOURCE,
    outcome: 'found',
    warnings: a.warnings,
    id: version.id,
    link: a.url,
    status: statusValue(a.statusAt, a.asOf, version.validToUndetermined === true),
    legifrance_status: labelOf(version.rawStatus),
    code: record.textTitle,
    code_id: record.textId,
    number: version.number,
    section: record.sectionPath,
    section_id: record.sectionCid,
    note: record.nota,
    relocation:
      a.relocation === null
        ? null
        : relocationSentence(a.relocation, version.number || '?', a.asOf, opts.today),
    neighbours:
      a.neighbours === undefined
        ? null
        : {
            previous: neighbourValue(a.neighbours.previous),
            next: neighbourValue(a.neighbours.next),
          },
    versions: opts.detailed
      ? record.versions.map((v) => ({
          id: v.id,
          version: v.version,
          legifrance_status: labelOf(v.rawStatus),
          from: v.validFrom,
          until: v.validTo,
          until_undetermined: v.validToUndetermined,
          shown: v.id === version.id,
        }))
      : null,
    modifications: opts.detailed
      ? record.modifications.map((m) => ({
          action: MODIFICATION_ACTIONS[m.kind],
          by: m.textTitle,
          effective: m.effectiveDate,
        }))
      : null,
    cited_by: opts.detailed ? record.citationsCount : null,
    part,
    next,
    text,
    request: opts.request,
    cached: [],
  });

  // The frame with the widest part and next: what is left of the budget is for the text.
  const end = fullText.length;
  const frame =
    JSON.stringify(page('', { from: offset, to: end, of: end }, { offset: end })).length +
    FRAME_SLACK;
  const slice = sliceForJson(fullText, offset, MAX_TOOL_TEXT - frame);
  const whole = offset === 0 && slice.nextOffset === null;
  return page(
    slice.text,
    whole ? null : { from: offset, to: slice.nextOffset ?? end, of: end },
    slice.nextOffset === null ? null : { offset: slice.nextOffset },
  );
}

/** The end of a period in a sentence. */
const periodEnd = (p: { validTo: IsoDate | null; validToUndetermined: boolean }) =>
  p.validTo ?? (p.validToUndetermined ? 'not yet determined' : 'no end');

function notInForceAnswer(
  r: Extract<GetArticleResult, { kind: 'not_in_force_at_date' }>,
  opts: GetArticleAnswerOptions,
): NotInForceAnswer {
  const article = `Art. ${r.num}${r.codeTitle === null ? '' : ` of ${r.codeTitle}`}`;
  // When a period's dates cover the date, the dated search and the dates disagree: say only
  // what the search found (a warning names the period), never "was not in force".
  const heading = r.periods.some((p) => coversDate(p, r.asOf))
    ? `${article}: Légifrance's dated search found no version in force on ${r.asOf}. Versions on record.`
    : `${article} exists but was not in force on ${r.asOf}.`;
  const moved = r.relocation;
  return {
    source: SOURCE,
    outcome: 'not_in_force',
    warnings: [
      heading,
      ...r.warnings,
      ...(r.possiblyIncomplete === true
        ? ['Légifrance returned a full page of versions: more versions may exist.']
        : []),
      'Call again with an "at_date" inside one of these periods to read that version.',
    ],
    number: r.num,
    code: r.codeTitle,
    on: r.asOf,
    periods: r.periods.map((p) => ({
      id: p.id,
      code: p.codeTitle,
      legifrance_status: labelOf(p.rawStatus),
      from: p.validFrom,
      until: p.validTo,
      until_undetermined: p.validToUndetermined,
      link: articleUrlFor(p.id),
    })),
    relocation:
      moved === undefined
        ? null
        : movedSentence(
            `the text of art. ${r.num} (version ${moved.from.validFrom ?? 'unknown'} → ${periodEnd(moved.from)})`,
            moved.movedTo,
            moved.from.validTo,
            opts.today,
          ),
    incomplete: r.possiblyIncomplete === true,
    request: opts.request,
    cached: [],
  };
}

function severalMatches(
  num: string,
  candidates: readonly ArticleHit[],
  incomplete: boolean,
  request: Pointer,
): LookupMissAnswer {
  const codes = new Set(candidates.map((c) => c.codeTitle));
  const oneCode = codes.size === 1 ? (candidates[0]?.codeTitle ?? null) : null;
  const warnings: string[] = [];
  if (oneCode !== null) {
    // Several versions in force in one code: only the id can tell them apart.
    warnings.push(
      `Article ${num} has several versions in force in ${oneCode} — call again with "id".`,
    );
  } else {
    warnings.push(`Article ${num} exists in several codes — call again with "code".`);
    if (codes.size < candidates.length) {
      warnings.push('Some codes have several versions in force: for those, give the "id".');
    }
  }
  if (incomplete) {
    warnings.push('(Only the first matches are listed — give the code to narrow it down.)');
  }
  return {
    source: SOURCE,
    outcome: 'several_matches',
    warnings,
    number: num,
    code: oneCode,
    candidates: candidates.map((c) => ({
      id: c.id,
      code: c.codeTitle,
      code_id: c.codeId,
      from: c.validFrom,
      legifrance_status: labelOf(c.rawStatus),
      read_with: { tool: TOOL, id: c.id },
    })),
    incomplete,
    request,
    cached: [],
  };
}

function notFoundSentences(
  r: Extract<LookupMiss, { kind: 'not_found' }>,
  requestedId: string | null,
): string[] {
  switch (r.reason) {
    case 'unknown_id':
      return [`No Légifrance article with id ${requestedId ?? '?'}.`];
    case 'no_article':
      return [`No article ${r.num} in ${r.codeTitle ?? 'any code'} on Légifrance.`];
    case 'unknown_code':
      return [
        `Unknown code "${r.codeTitle}": no Légifrance code has this title. Use the full title (e.g. "Code de la route") or omit the code.`,
        ...(r.didYouMean.length > 0
          ? [
              `Did you mean: ${r.didYouMean.join('; ')}? (suggestions only — call again with the exact code title)`,
            ]
          : []),
      ];
  }
}

/**
 * The answer when no single article was found: the candidates, or the miss. Shared with the
 * history tool so both answer a bad citation identically.
 */
export function buildLookupMiss(result: LookupMiss, opts: LookupMissOptions): LookupMissAnswer {
  if (result.kind === 'ambiguous') {
    return severalMatches(
      result.num,
      result.candidates,
      result.possiblyIncomplete === true,
      opts.request,
    );
  }
  return {
    source: SOURCE,
    outcome: 'not_found',
    warnings: notFoundSentences(result, opts.requestedId),
    reason: result.reason,
    id: opts.requestedId,
    number: result.num,
    code: result.codeTitle,
    did_you_mean: result.didYouMean,
    request: opts.request,
    cached: [],
  };
}

/** The answer body (one page of it, for an article). */
export function buildGetArticleAnswer(
  result: GetArticleResult,
  opts: GetArticleAnswerOptions,
): GetArticleAnswer {
  switch (result.kind) {
    case 'found':
      return foundAnswer(result.article, opts);
    case 'not_in_force_at_date':
      // A page of periods, at most: well under MAX_TOOL_TEXT.
      return notInForceAnswer(result, opts);
    default:
      return buildLookupMiss(result, opts);
  }
}

export function registerGetArticleTool(
  server: McpServer,
  getArticle: GetArticle,
  ctx: ToolContext,
): void {
  server.registerTool(
    TOOL,
    {
      title: 'Get a French code article',
      description: DESCRIPTION,
      inputSchema,
      outputSchema: getArticleOutput,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args, extra) => {
      const request = requestEcho(TOOL, inputSchema, args, {
        at_date: ctx.today(),
        response_format: 'concise',
        offset: 0,
        include_neighbours: false,
      });
      const signal = callSignal(extra.mcpReq.signal, ctx.deadlineMs);
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
        const body = buildGetArticleAnswer(result, {
          request,
          detailed: args.response_format === 'detailed',
          today: ctx.today(),
          requestedId: id ?? null,
          offset: args.offset ?? 0,
        });
        return toolAnswer(getArticleOutput, body, ctx);
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
