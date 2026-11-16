import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import type { IsoDate } from '../../domain/dates.js';
import { jorfUrl, lodaUrl } from '../../domain/links.js';
import { coversDate, type StatusAt, statusAt } from '../../domain/status-at.js';
import type {
  GetTextInput,
  GetTextResult,
  NotInForceText,
  TextNature,
  TextView,
} from '../../services/legislation/get-text.js';
import type {
  CallContext,
  LegislationHit,
  TextArticle,
  TextSection,
} from '../../services/legislation/ports.js';
import {
  type AnswerBody,
  answerSchema,
  dateSchema,
  legifranceLinkSchema,
  legifranceStatusSchema,
  natureSchema,
  nextSchema,
  norSchema,
  type Pointer,
  pageSchema,
  pointerSchema,
  publishedSchema,
  requestEcho,
  statusSchema,
  statusValue,
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
  sliceForJson,
  WIDE_PAGE,
} from '../format.js';
import { toolError } from '../tool-error.js';

export type GetText = (input: GetTextInput, ctx?: CallContext) => Promise<GetTextResult>;

const TOOL = 'legifrance_get_text';
const SOURCE = 'Légifrance';

const DESCRIPTION =
  'Read a French law, ordinance, decree or order from Légifrance — by Légifrance id (LEGITEXT… consolidated version, JORFTEXT… as published), by NOR, or by nature + number (e.g. nature "loi", number "78-17"). "outline" returns the text\'s title, status, publication and its sections with article counts; "articles" returns the article texts page by page (optionally only one section via section_id). at_date picks the consolidated version in force on that date. Collective agreements (KALI) are not supported here: find them with legifrance_search_legislation.';

const NATURES = [
  'loi',
  'loi_organique',
  'ordonnance',
  'decret',
  'arrete',
] as const satisfies readonly TextNature[];

const PARTS = ['outline', 'articles'] as const;
type Part = (typeof PARTS)[number];

const DEFAULT_PART: Part = 'outline';
const DEFAULT_PAGE = 1;

const inputSchema = z.object({
  id: z
    .string()
    .optional()
    .describe(
      'Légifrance text id: LEGITEXT + 12 digits (consolidated version) or JORFTEXT + 12 digits (as published in the Journal officiel).',
    ),
  nor: z
    .string()
    .optional()
    .describe('NOR of the text, e.g. "JUSC1522466R" (read as published in the Journal officiel).'),
  nature: z
    .enum(NATURES)
    .optional()
    .describe(
      'Nature of the text, given with "number": loi, loi_organique, ordonnance, decret or arrete.',
    ),
  number: z
    .string()
    .optional()
    .describe('Number of the text, given with "nature", e.g. "78-17", "2016-131".'),
  at_date: optionalIsoDateSchema.describe(
    'Read the consolidated version in force on this date, YYYY-MM-DD. Default: today. Not for a JORFTEXT id or a NOR (read as published).',
  ),
  section_id: z
    .string()
    .optional()
    .describe('A section_id from the outline: only that section (its outline, or its articles).'),
  part: z
    .enum(PARTS)
    .optional()
    .describe(
      '"outline" (default): title, status, publication and the sections with their article counts. "articles": the article texts, page by page.',
    ),
  page: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Page of the outline or of the articles (default 1), as given in the answer.'),
});

/** Most sections or article slices on one page; the character budget usually binds first. */
const MAX_ITEMS = 1_000;

/** Wide stand-ins for the numbers a page budget is measured with, so pages split the same way whatever page is asked. */
const WIDE = WIDE_PAGE;

// ---------------------------------------------------------------------------------------------
// Output schema

const textIdSchema = z
  .string()
  .describe('Légifrance id of the text: LEGITEXT… (consolidated) or JORFTEXT… (as published).');

const askedSchema = z
  .string()
  .describe(
    'What was looked up: a nature and number ("décret 2005-1309"), a text id ("text LEGITEXT…") or a NOR ("text with NOR …").',
  );

const incompleteSchema = z
  .boolean()
  .describe('Légifrance lists more matches than shown: more candidates may exist.');

const sectionItemSchema = z.object({
  type: z.literal('section'),
  title: z.string().describe('Title of the section.'),
  section_id: z.string().describe('Légifrance id of the section.'),
  depth: z
    .number()
    .int()
    .describe('Nesting level: 0 for a section directly in the text, or directly in `section`.'),
  articles: z.number().int().describe('Articles in the section and its sub-sections.'),
  in_force: z
    .number()
    .int()
    .nullable()
    .describe(
      'Of those, the articles in force on `on` by their dates; null for a text as published.',
    ),
});

const articleItemSchema = z.object({
  type: z.literal('article'),
  section: z
    .array(z.string())
    .describe('Titles of the sections holding the article, outermost first; empty outside any.'),
  number: z.string().nullable().describe('Article number; null when Légifrance gives none.'),
  id: z.string().describe('Légifrance id of the article version.'),
  slice: z
    .object({ index: z.number().int(), of: z.number().int() })
    .nullable()
    .describe(
      'This item holds part `index` (from 1) of `of` parts of the article text; null when it holds the whole text.',
    ),
  status: statusSchema
    .nullable()
    .describe(
      'Whether the article version applies on `on`, from its dates; null for a text as published, or when Légifrance gives the article no in-force dates.',
    ),
  legifrance_status: legifranceStatusSchema.describe(
    "Légifrance's own status label for the article version (VIGUEUR, ABROGE…); null for a text as published, or when it gives none.",
  ),
  text: z
    .string()
    .nullable()
    .describe(
      'The official text of the article (this part of it); null when withheld because the version is not in force on `on`; empty when Légifrance has none.',
    ),
});

const textShape = {
  id: textIdSchema,
  text_cid: z
    .string()
    .nullable()
    .describe('Légifrance id shared by every version of the text; null when not given.'),
  title: z.string().describe('Title of the text.'),
  nature: natureSchema,
  legifrance_status: legifranceStatusSchema.describe(
    "Légifrance's own label for the legal state of the text (Vigueur, Sans état juridique…); null when it gives none.",
  ),
  nor: norSchema,
  published: publishedSchema,
  journal: z
    .string()
    .nullable()
    .describe('The Journal officiel issue that published the text; null when not given.'),
  signed: dateSchema.nullable().describe('Signature date of the text; null when not given.'),
  version: z
    .enum(['as_published', 'consolidated'])
    .describe(
      'as_published: the initial version published in the Journal officiel, later amendments not included; consolidated: the version in force on `on`.',
    ),
  on: dateSchema.describe(
    'The date the consolidated version and the article statuses are read for; for a text as published, the day of the call.',
  ),
  link: legifranceLinkSchema,
  section: z
    .object({
      path: z.array(z.string()).describe('Titles from the outermost section down to this one.'),
      section_id: z.string().describe('Légifrance id of the section.'),
    })
    .nullable()
    .describe('The one section the answer covers; null for the whole text.'),
  part: z
    .enum(PARTS)
    .describe('outline: the sections with their article counts; articles: the article texts.'),
  article_count: z.number().int().describe('Articles of the text, or of `section`.'),
  in_force_count: z
    .number()
    .int()
    .nullable()
    .describe(
      'Of those, the articles in force on `on` by their dates; null for a text as published.',
    ),
  outside_sections_count: z
    .number()
    .int()
    .describe(
      'Of those, the articles outside any sub-section (directly in the text, or in `section`).',
    ),
  results: z
    .number()
    .int()
    .describe('Items of this part over all pages (each part of a split article counts once).'),
  page: pageSchema,
  next: nextSchema,
  items: z
    .array(z.discriminatedUnion('type', [sectionItemSchema, articleItemSchema]))
    .describe(
      'The sections of this page, outer before inner (outline), or its articles in order, a long one split in parts (articles).',
    ),
  read_with: pointerSchema
    .nullable()
    .describe('The tool call that returns the article texts of this outline; null for articles.'),
};

const textCandidateSchema = z.object({
  title: z.string().describe('Title of the text.'),
  nature: natureSchema,
  nor: norSchema,
  published: publishedSchema,
  id: textIdSchema,
  link: legifranceLinkSchema,
  read_with: pointerSchema.describe('The tool call that returns this text.'),
});

const notInForceCandidateSchema = z.object({
  title: z.string().describe('Title of the text.'),
  nature: natureSchema,
  nor: norSchema,
  published: publishedSchema,
  id: textIdSchema,
  link: legifranceLinkSchema,
  verdict: z
    .enum(['ended', 'not_yet', 'undetermined', 'no_version'])
    .describe(
      'ended: no longer in force on `on`; not_yet: not yet in force on `on`; undetermined: its in-force dates cannot be told from Légifrance; no_version: Légifrance has no version of the text on `on`.',
    ),
  verdict_date: dateSchema
    .nullable()
    .describe(
      'When it ceased (ended) or enters into force (not_yet); null otherwise, or when not given.',
    ),
});

const foundBranch = answerSchema(SOURCE, 'found', textShape);
const noResultsBranch = answerSchema(SOURCE, 'no_results', textShape);

const severalMatchesBranch = answerSchema(SOURCE, 'several_matches', {
  asked: askedSchema,
  candidates: z.array(textCandidateSchema).describe('The texts matching what was asked.'),
  incomplete: incompleteSchema,
});

const notInForceBranch = answerSchema(SOURCE, 'not_in_force', {
  asked: askedSchema,
  on: dateSchema.describe('The date looked up.'),
  candidates: z
    .array(notInForceCandidateSchema)
    .describe('The texts matching what was asked; none is in force on `on`.'),
  incomplete: incompleteSchema,
});

const notFoundBranch = answerSchema(SOURCE, 'not_found', {
  reason: z
    .enum(['no_text', 'other_nature'])
    .describe(
      'no_text: Légifrance has no text matching what was asked; other_nature: no text of the nature asked carries the number, texts of other natures do.',
    ),
  asked: askedSchema,
  candidates: z
    .array(textCandidateSchema)
    .describe('The texts of other natures carrying the number (other_nature); empty for no_text.'),
  incomplete: incompleteSchema,
});

export const getTextOutput = z.discriminatedUnion('outcome', [
  foundBranch,
  noResultsBranch,
  severalMatchesBranch,
  notInForceBranch,
  notFoundBranch,
]);

// ---------------------------------------------------------------------------------------------
// Answer builder

export type GetTextAnswer = AnswerBody<z.input<typeof getTextOutput>>;
type TextAnswer = AnswerBody<z.input<typeof foundBranch | typeof noResultsBranch>>;
type Item = TextAnswer['items'][number];
type SectionItem = Extract<Item, { type: 'section' }>;
type ArticleItem = Extract<Item, { type: 'article' }>;
type TextCandidate = z.input<typeof textCandidateSchema>;

export interface GetTextAnswerOptions {
  /** The call's `request` (`requestEcho`). */
  request: Pointer;
  part: Part;
  /** 1-based page of the outline or of the articles. */
  page: number;
  /** What was asked: echoed when no single text answers it. */
  input: GetTextInput;
  /** The date a text is read on when no `at_date` is given. */
  today: IsoDate;
}

const NATURE_LABELS: Readonly<Record<TextNature, string>> = {
  loi: 'loi',
  loi_organique: 'loi organique',
  ordonnance: 'ordonnance',
  decret: 'décret',
  arrete: 'arrêté',
};

const MORE = 'Légifrance lists more matches than shown; refine with nature or a Légifrance id.';

const isJorf = (textId: string) => textId.startsWith('JORFTEXT');
const textUrl = (textId: string) => (isJorf(textId) ? jorfUrl(textId) : lodaUrl(textId));

/**
 * The call that reads a text: a JORFTEXT is read as published; a LEGITEXT on `on`, the date this
 * answer is about (`at_date` would change which version is read).
 */
function readText(textId: string, on: IsoDate): Pointer {
  return isJorf(textId) ? { tool: TOOL, id: textId } : { tool: TOOL, id: textId, at_date: on };
}

/** What was asked, as an answer echoes it: `décret 2005-1309`, `text LEGITEXT…`, `text with NOR …`. */
function askedLabel(input: GetTextInput): string {
  if (input.id !== undefined) return `text ${input.id}`;
  if (input.nor !== undefined) return `text with NOR ${input.nor}`;
  return [input.nature === undefined ? '' : NATURE_LABELS[input.nature], input.number ?? '']
    .join(' ')
    .trim();
}

function textCandidate(h: LegislationHit, on: IsoDate): TextCandidate {
  return {
    title: h.title,
    nature: h.nature,
    nor: h.nor,
    published: h.publishedOn,
    id: h.textId,
    link: textUrl(h.textId),
    read_with: readText(h.textId, on),
  };
}

function notInForceCandidate(c: NotInForceText) {
  return {
    title: c.title,
    nature: c.nature,
    nor: c.nor,
    published: c.publishedOn,
    id: c.textId,
    link: textUrl(c.textId),
    verdict: c.verdict,
    verdict_date: c.on,
  };
}

// ---------------------------------------------------------------------------------------------
// A found text: every page carries every field of the text; only `items` is paged.

const asPublished = (v: TextView) => isJorf(v.record.id);

/** Section titles from the root down to `target` (excluded); `null` when absent. */
function titlesTo(sections: readonly TextSection[], target: TextSection): string[] | null {
  for (const s of sections) {
    if (s === target) return [];
    const inner = titlesTo(s.sections, target);
    if (inner !== null) return [s.title, ...inner];
  }
  return null;
}

/**
 * How an article stands on the date, by the rule the text's verdict uses (`textForceAt`): in
 * force only when its dates cover the date. An article without a start date that has not ended
 * is `undated`: Légifrance gives no in-force dates for it, so its text is shown with no status
 * and it is never counted as in force. Otherwise it is not in force (`statusAt` says why) and
 * its text is withheld.
 */
type ArticleOn =
  | { kind: 'in_force'; status: StatusAt }
  | { kind: 'undated' }
  | { kind: 'not_in_force'; status: StatusAt };

function articleOn(a: TextArticle, v: TextView): ArticleOn {
  const status = statusAt(a, v.asOf);
  if (coversDate(a, v.asOf)) return { kind: 'in_force', status };
  return status.inForce ? { kind: 'undated' } : { kind: 'not_in_force', status };
}

const inForceOn = (a: TextArticle, v: TextView) => articleOn(a, v).kind === 'in_force';

interface Counts {
  total: number;
  inForce: number;
}

function countArticles(
  node: { sections: readonly TextSection[]; articles: readonly TextArticle[] },
  v: TextView,
): Counts {
  const counts = {
    total: node.articles.length,
    inForce: node.articles.filter((a) => inForceOn(a, v)).length,
  };
  for (const s of node.sections) {
    const inner = countArticles(s, v);
    counts.total += inner.total;
    counts.inForce += inner.inForce;
  }
  return counts;
}

/** The sections of the text, or of the focused section, depth first. */
function sectionItems(v: TextView): SectionItem[] {
  const published = asPublished(v);
  const items: SectionItem[] = [];
  const walk = (sections: readonly TextSection[], depth: number) => {
    for (const s of sections) {
      const counts = countArticles(s, v);
      items.push({
        type: 'section',
        title: s.title,
        section_id: s.cid,
        depth,
        articles: counts.total,
        in_force: published ? null : counts.inForce,
      });
      walk(s.sections, depth + 1);
    }
  };
  walk((v.focus ?? v.record).sections, 0);
  return items;
}

/**
 * One article, whole. A version not in force on the date is never shown as the law of that date
 * (text withheld); an undated one is shown with no status. A text as published makes no in-force
 * claim: no status, no label.
 */
function articleItem(a: TextArticle, path: string[], v: TextView): ArticleItem {
  const base = {
    type: 'article' as const,
    section: path,
    number: a.num || null,
    id: a.id,
    slice: null,
  };
  if (asPublished(v)) return { ...base, status: null, legifrance_status: null, text: a.text };
  const on = articleOn(a, v);
  return {
    ...base,
    status: on.kind === 'undated' ? null : statusValue(on.status, v.asOf, a.validToUndetermined),
    legifrance_status: a.rawStatus || null,
    text: on.kind === 'not_in_force' ? null : a.text,
  };
}

/**
 * Each article as one item, or as several when its text alone would overflow a page of
 * `budget` characters: the text is cut by its escaped JSON length (`sliceForJson`).
 */
function articleItems(v: TextView, budget: number): ArticleItem[] {
  const items: ArticleItem[] = [];
  for (const { article, path } of v.flatArticles) {
    const whole = articleItem(article, path, v);
    const body = whole.text;
    // The item with the widest `slice` and no text: what is left of the budget is for the text.
    const room = budget - jsonCost({ ...whole, slice: { index: WIDE, of: WIDE }, text: '' });
    if (body === null || JSON.stringify(body).length - 2 <= room) {
      items.push(whole);
      continue;
    }
    const texts: string[] = [];
    let offset = 0;
    do {
      const part = sliceForJson(body, offset, room);
      texts.push(part.text);
      offset = part.nextOffset ?? body.length;
    } while (offset < body.length);
    for (const [i, text] of texts.entries()) {
      items.push({ ...whole, slice: { index: i + 1, of: texts.length }, text });
    }
  }
  return items;
}

/** One page of a found text (`no_results` past the last page). */
function textAnswer(v: TextView, opts: GetTextAnswerOptions): TextAnswer {
  const r = v.record;
  const published = asPublished(v);
  const scope = v.focus ?? r;
  const counts = countArticles(scope, v);
  const withheld = `(Text not shown: not in force on ${v.asOf}. Read it with an "at_date" inside its validity, or with legifrance_get_article and its id.)`;
  const answer = (
    outcome: TextAnswer['outcome'],
    page: TextAnswer['page'],
    next: TextAnswer['next'],
    results: number,
    items: Item[],
    notes: string[],
  ): TextAnswer => ({
    source: SOURCE,
    outcome,
    warnings: [...v.warnings, ...notes],
    id: r.id,
    text_cid: r.cid || null,
    title: r.title,
    nature: r.nature || null,
    legifrance_status: r.jurisState || null,
    nor: r.nor,
    published: r.publishedOn,
    journal: r.jorfLabel,
    signed: r.signedOn,
    version: published ? 'as_published' : 'consolidated',
    on: v.asOf,
    link: v.url,
    section:
      v.focus === null
        ? null
        : {
            path: [...(titlesTo(r.sections, v.focus) ?? []), v.focus.title],
            section_id: v.focus.cid,
          },
    part: opts.part,
    article_count: counts.total,
    in_force_count: published ? null : counts.inForce,
    outside_sections_count: scope.articles.length,
    results,
    page,
    next,
    items,
    read_with:
      opts.part === 'outline'
        ? {
            ...readText(r.id, v.asOf),
            ...(v.focus !== null && { section_id: v.focus.cid }),
            part: 'articles',
          }
        : null,
    request: opts.request,
    cached: [],
  });

  // The frame: this answer with no items, its widest numbers and every note it may carry,
  // measured the same for every page asked (the request's page included), so pages split alike.
  const frame =
    JSON.stringify({
      ...answer(
        'no_results',
        { number: WIDE, of: WIDE },
        { page: WIDE },
        WIDE,
        [],
        opts.part === 'articles' ? [withheld] : [],
      ),
      request: { ...opts.request, page: WIDE },
    }).length + FRAME_SLACK;
  const budget = MAX_TOOL_TEXT - frame;
  const all: Item[] = opts.part === 'outline' ? sectionItems(v) : articleItems(v, budget);
  const paged = listPage(all, opts.page, (item) => jsonCost(item), {
    maxItems: MAX_ITEMS,
    budget,
  });
  const anyWithheld = paged.items.some((i) => i.type === 'article' && i.text === null);
  return answer(
    paged.pastEnd ? 'no_results' : 'found',
    { number: opts.page, of: paged.pageCount },
    paged.hasMore ? { page: opts.page + 1 } : null,
    paged.total,
    paged.items,
    anyWithheld ? [withheld] : [],
  );
}

/** The answer body: one page of a found text, or the candidates / the miss, what was asked echoed. */
export function buildGetTextAnswer(
  result: GetTextResult,
  opts: GetTextAnswerOptions,
): GetTextAnswer {
  const asked = askedLabel(opts.input);
  const on = opts.input.atDate ?? opts.today;
  const tail = { request: opts.request, cached: [] };
  switch (result.kind) {
    case 'found':
      return textAnswer(result.text, opts);
    // At most one search page of candidates (10): well under MAX_TOOL_TEXT.
    case 'ambiguous':
      return {
        source: SOURCE,
        outcome: 'several_matches',
        warnings: [
          `Several texts match ${asked}.`,
          ...(result.more ? [MORE] : []),
          'Call again with the "id" of the text you mean.',
        ],
        asked,
        candidates: result.candidates.map((h) => textCandidate(h, on)),
        incomplete: result.more,
        ...tail,
      };
    case 'not_in_force':
      return {
        source: SOURCE,
        outcome: 'not_in_force',
        warnings: [
          result.candidates.length > 0 &&
          result.candidates.every((c) => c.verdict === 'undetermined')
            ? `Légifrance gives no in-force dates for ${asked} on ${result.asOf}.`
            : `No ${asked} in force on ${result.asOf}.`,
          ...(result.more ? [MORE] : []),
          'To read it, pass its id with an at_date inside its validity.',
        ],
        asked,
        on: result.asOf,
        candidates: result.candidates.map(notInForceCandidate),
        incomplete: result.more,
        ...tail,
      };
    case 'other_nature':
      return {
        source: SOURCE,
        outcome: 'not_found',
        warnings: [
          `Légifrance files no ${opts.input.nature === undefined ? 'text' : NATURE_LABELS[opts.input.nature]} numbered ${result.number}; these texts carry that number.`,
          ...(result.more ? [MORE] : []),
          'Pass one of these ids to read it.',
        ],
        reason: 'other_nature',
        asked,
        candidates: result.candidates.map((h) => textCandidate(h, on)),
        incomplete: result.more,
        ...tail,
      };
    case 'not_found': {
      const byNumber = opts.input.id === undefined && opts.input.nor === undefined;
      return {
        source: SOURCE,
        outcome: 'not_found',
        warnings: [
          `No ${asked} on Légifrance${byNumber ? ', in force or not' : ''}. Check it, or search with legifrance_search_legislation.`,
        ],
        reason: 'no_text',
        asked,
        candidates: [],
        incomplete: false,
        ...tail,
      };
    }
  }
}

export function registerGetTextTool(server: McpServer, getText: GetText, ctx: ToolContext): void {
  server.registerTool(
    TOOL,
    {
      title: 'Read a French law, ordinance or decree',
      description: DESCRIPTION,
      inputSchema,
      outputSchema: getTextOutput,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args, extra) => {
      const today = ctx.today();
      const id = presentOrUndefined(args.id);
      const nor = presentOrUndefined(args.nor);
      // A JORFTEXT id or a NOR is read as published: `at_date` does not apply.
      const readAsPublished = nor !== undefined || (id !== undefined && isJorf(id));
      const request = requestEcho(TOOL, inputSchema, args, {
        ...(!readAsPublished && { at_date: today }),
        part: DEFAULT_PART,
        page: DEFAULT_PAGE,
      });
      const signal = callSignal(extra.mcpReq.signal, ctx.deadlineMs);
      try {
        const input: GetTextInput = {
          id,
          nor,
          nature: args.nature,
          number: presentOrUndefined(args.number),
          atDate: presentOrUndefined(args.at_date),
          sectionCid: presentOrUndefined(args.section_id),
        };
        const result = await getText(input, { signal });
        const body = buildGetTextAnswer(result, {
          request,
          part: args.part ?? DEFAULT_PART,
          page: args.page ?? DEFAULT_PAGE,
          input,
          today,
        });
        return toolAnswer(getTextOutput, body, ctx);
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
