import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { jorfUrl, lodaUrl } from '../../domain/links.js';
import { statusAt } from '../../domain/status-at.js';
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
  callSignal,
  MAX_TOOL_TEXT,
  nextPageHint,
  optionalIsoDateSchema,
  pageByBudget,
  paginateText,
  presentOrUndefined,
  renderStatusAt,
} from '../format.js';
import { toToolError } from '../tool-error.js';

export type GetText = (input: GetTextInput, ctx?: CallContext) => Promise<GetTextResult>;

const DESCRIPTION =
  'Read a French law, ordinance, decree or order from Légifrance — by Légifrance id (LEGITEXT… consolidated version, JORFTEXT… as published), by NOR, or by nature + number (e.g. nature "loi", number "78-17"). "outline" returns the text\'s title, status, publication and its sections with article counts; "articles" returns the article texts page by page (optionally only one section via section_id). at_date picks the consolidated version in force on that date. Collective agreements (KALI) are not supported here: find them with legifrance_search_legislation.';

const NATURES = [
  'loi',
  'loi_organique',
  'ordonnance',
  'decret',
  'arrete',
] as const satisfies readonly TextNature[];

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
    .enum(['outline', 'articles'])
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

export interface TextRenderOptions {
  part: 'outline' | 'articles';
  /** 1-based page of the outline or of the articles. */
  page: number;
  /** What was asked: echoed when no single text answers it. */
  input: GetTextInput;
}

/** Room kept below the cap for rounding (separators, page numbers). */
const SAFETY = 200;
/** A slice of a long article never shrinks below this, however large the frame around it. */
const MIN_SLICE = 2_000;
/** Most lines or article slices on one page; the character budget usually binds first. */
const MAX_ITEMS = 1_000;

const NATURE_LABELS: Readonly<Record<TextNature, string>> = {
  loi: 'loi',
  loi_organique: 'loi organique',
  ordonnance: 'ordonnance',
  decret: 'décret',
  arrete: 'arrêté',
};

const MORE = 'Légifrance lists more matches than shown; refine with nature or a Légifrance id.';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const opt = (v: string | null, f: (v: string) => string) => (v === null || v === '' ? null : f(v));
const textUrl = (textId: string) =>
  textId.startsWith('LEGITEXT') ? lodaUrl(textId) : jorfUrl(textId);

/** What was asked, as an answer echoes it: `décret 2005-1309`, `text LEGITEXT…`, `text with NOR …`. */
function askedLabel(input: GetTextInput): string {
  if (input.id !== undefined) return `text ${input.id}`;
  if (input.nor !== undefined) return `text with NOR ${input.nor}`;
  return [input.nature === undefined ? '' : NATURE_LABELS[input.nature], input.number ?? '']
    .join(' ')
    .trim();
}

/** A candidate text on one line: what identifies it, then its id and official link. */
function candidateLine(facts: Array<string | null>): string {
  return `- ${facts.filter((f) => f !== null).join(' · ')}`;
}

function hitLine(h: LegislationHit): string {
  return candidateLine([
    h.title,
    h.nature,
    opt(h.nor, (n) => `NOR ${n}`),
    opt(h.publishedOn, (d) => `Published ${d}`),
    `id ${h.textId}`,
    textUrl(h.textId),
  ]);
}

/** Whether the text stopped or has yet to start applying; never a sentinel date (they are null). */
function verdictPhrase(c: NotInForceText): string {
  switch (c.verdict) {
    case 'ended':
      return c.on === null ? 'no longer in force' : `no longer in force — ceased ${c.on}`;
    case 'not_yet':
      return c.on === null ? 'not yet in force' : `not yet in force — enters into force ${c.on}`;
    case 'undetermined':
      return 'in-force dates not determinable from Légifrance';
  }
}

function notInForceLine(c: NotInForceText): string {
  return candidateLine([
    c.title,
    c.nature,
    opt(c.nor, (n) => `NOR ${n}`),
    opt(c.publishedOn, (d) => `Published ${d}`),
    verdictPhrase(c),
    `id ${c.textId}`,
    textUrl(c.textId),
  ]);
}

// ---------------------------------------------------------------------------------------------
// A found text: every page repeats the header (title, status, publication, version), the
// warnings and the footer (official link), so each page says what it is a part of.

const asPublished = (v: TextView) => v.record.id.startsWith('JORFTEXT');

/** Section titles from the root down to `target` (excluded); `null` when absent. */
function titlesTo(sections: readonly TextSection[], target: TextSection): string[] | null {
  for (const s of sections) {
    if (s === target) return [];
    const inner = titlesTo(s.sections, target);
    if (inner !== null) return [s.title, ...inner];
  }
  return null;
}

function headerOf(v: TextView): string {
  const r = v.record;
  const facts = [
    r.nature,
    opt(r.jurisState, (s) => `Légifrance status: ${s}`),
    opt(r.nor, (n) => `NOR ${n}`),
  ].filter((f) => f !== null);
  const lines = [`### ${r.title}`];
  if (facts.length > 0) lines.push(facts.join(' · '));
  if (r.publishedOn !== null) {
    lines.push(
      `Published: ${r.publishedOn} (${r.jorfLabel ?? 'Journal officiel publication date'})`,
    );
  }
  lines.push(
    asPublished(v)
      ? 'As published in the Journal officiel: initial version, later amendments not included'
      : `Version in force on ${v.asOf} (consolidated)`,
  );
  if (v.focus !== null) {
    const path = [...(titlesTo(r.sections, v.focus) ?? []), v.focus.title];
    lines.push(`Section: ${path.join(' › ')} · section_id ${v.focus.cid}`);
  }
  return lines.join('\n');
}

/** One page: the frame around `blocks`. */
function framed(v: TextView, blocks: string[]): string {
  return [
    headerOf(v),
    ...(v.warnings.length > 0 ? [v.warnings.map((w) => `⚠️ ${w}`).join('\n')] : []),
    ...blocks,
    `Source: ${v.url}\nLégifrance id: ${v.record.id}`,
  ].join('\n\n');
}

const inForceOn = (a: TextArticle, v: TextView) => statusAt(a, v.asOf).inForce;

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

/** `12 articles (10 in force)`; a text as published makes no in-force claim. */
function countLabel(c: Counts, v: TextView, onDate = false): string {
  if (asPublished(v)) return plural(c.total, 'article');
  return `${plural(c.total, 'article')} (${c.inForce} in force${onDate ? ` on ${v.asOf}` : ''})`;
}

const OUTLINE_HINT =
  'Read the article texts with "part": "articles" — the whole text, or one section with its "section_id".';

function renderOutline(v: TextView, page: number): string {
  const scope = v.focus ?? v.record;
  const lines: string[] = [];
  const walk = (sections: readonly TextSection[], depth: number) => {
    for (const s of sections) {
      lines.push(
        `${'  '.repeat(depth)}- ${s.title} · ${countLabel(countArticles(s, v), v)} · section_id ${s.cid}`,
      );
      walk(s.sections, depth + 1);
    }
  };
  walk(scope.sections, 0);

  let summary = countLabel(countArticles(scope, v), v, true);
  if (scope.articles.length > 0 && scope.sections.length > 0) {
    summary += `, ${scope.articles.length} ${v.focus === null ? 'outside any section' : 'directly in this section'}`;
  }
  const assemble = (pageNote: string, list: string[], next: string | null) =>
    framed(v, [
      `${summary}${pageNote}`,
      ...(list.length > 0 ? [list.join('\n')] : []),
      ...(next === null ? [] : [next]),
      OUTLINE_HINT,
    ]);
  const frame = assemble(' — page 99999 of 99999', [''], nextPageHint(99999)).length;
  const paged = pageByBudget(lines, page, (l) => l.length + 1, {
    maxItems: MAX_ITEMS,
    budget: MAX_TOOL_TEXT - frame - SAFETY,
  });
  return assemble(
    paged.pageCount > 1 ? ` — page ${page} of ${paged.pageCount}` : '',
    paged.items,
    paged.hasMore ? nextPageHint(page) : null,
  );
}

/** One article, or one part of an article too long for a page. */
interface Slice {
  article: TextArticle;
  path: string[];
  text: string;
  part: number;
  parts: number;
}

function statusLine(a: TextArticle, v: TextView): string {
  if (asPublished(v)) return `As published · id ${a.id}`;
  const status = renderStatusAt(statusAt(a, v.asOf), v.asOf, {
    validToUndetermined: a.validToUndetermined,
  });
  return `${status}${a.rawStatus ? ` (${a.rawStatus})` : ''} · id ${a.id}`;
}

/** The article text; a version not in force on the date is never shown as the law of that date. */
function bodyOf(a: TextArticle, v: TextView): string {
  if (!asPublished(v) && !inForceOn(a, v)) {
    return `(Text not shown: not in force on ${v.asOf}. Read it with an "at_date" inside its validity, or with legifrance_get_article and its id.)`;
  }
  return a.text === '' ? '(Légifrance has no text for this article.)' : a.text;
}

function renderSlice(s: Slice, v: TextView, withPath: boolean, partLabel?: string): string {
  const part = partLabel ?? (s.parts > 1 ? ` (part ${s.part} of ${s.parts})` : '');
  return [
    ...(withPath && s.path.length > 0 ? [`Section: ${s.path.join(' › ')}`] : []),
    `#### Art. ${s.article.num ?? '(unnumbered)'}${part}`,
    statusLine(s.article, v),
    s.text,
  ].join('\n');
}

/** Each article as one slice, or as several when its text alone would overflow a page. */
function slicesOf(v: TextView, budget: number): Slice[] {
  const slices: Slice[] = [];
  for (const { article, path } of v.flatArticles) {
    const body = bodyOf(article, v);
    const empty = { article, path, text: '', part: 0, parts: 0 };
    // The frame of one slice with the longest part label, plus the separator after it.
    const frame = renderSlice(empty, v, true, ' (part 99999 of 99999)').length + 2;
    const room = Math.max(MIN_SLICE, budget - frame);
    const texts: string[] = [];
    let offset = 0;
    do {
      const next = paginateText(body, offset, room);
      texts.push(next.text);
      offset = next.nextOffset ?? body.length;
    } while (offset < body.length);
    for (const [i, text] of texts.entries()) {
      slices.push({ article, path, text, part: i + 1, parts: texts.length });
    }
  }
  return slices;
}

const samePath = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((t, i) => t === b[i]);

function renderArticles(v: TextView, page: number): string {
  const inForce = v.flatArticles.filter((f) => inForceOn(f.article, v)).length;
  const counts = countLabel({ total: v.flatArticles.length, inForce }, v, true);
  const assemble = (pageNote: string, body: string, next: string | null) =>
    framed(v, [`${counts}${pageNote}`, body, ...(next === null ? [] : [next])]);
  const budget = MAX_TOOL_TEXT - assemble(' — page 99999 of 99999', '', nextPageHint(99999)).length;
  const room = budget - SAFETY;
  const paged = pageByBudget(slicesOf(v, room), page, (s) => renderSlice(s, v, true).length + 2, {
    maxItems: MAX_ITEMS,
    budget: room,
  });
  // The section path opens the page and marks each change of section.
  const blocks = paged.items.map((s, i) => {
    const previous = paged.items[i - 1];
    return renderSlice(s, v, previous === undefined || !samePath(previous.path, s.path));
  });
  return assemble(
    ` — page ${page} of ${paged.pageCount}`,
    blocks.length > 0 ? blocks.join('\n\n') : '(No articles.)',
    paged.hasMore ? nextPageHint(page) : null,
  );
}

/** The text answer: one page of a found text, or the candidates / the miss, input echoed. */
export function renderGetText(result: GetTextResult, opts: TextRenderOptions): string {
  const asked = askedLabel(opts.input);
  switch (result.kind) {
    case 'found':
      return opts.part === 'articles'
        ? renderArticles(result.text, opts.page)
        : renderOutline(result.text, opts.page);
    // At most one search page of candidates (10): well under MAX_TOOL_TEXT.
    case 'ambiguous':
      return [
        `Several texts match ${asked}:`,
        ...result.candidates.map(hitLine),
        ...(result.more ? [MORE] : []),
        'Call again with the "id" of the text you mean.',
      ].join('\n');
    case 'not_in_force':
      return [
        `No ${asked} in force on ${result.asOf}.`,
        ...result.candidates.map(notInForceLine),
        ...(result.more ? [MORE] : []),
        'To read it, pass its id with an at_date inside its validity.',
      ].join('\n');
    case 'not_found': {
      const byNumber = opts.input.id === undefined && opts.input.nor === undefined;
      return `No ${asked} on Légifrance${byNumber ? ', in force or not' : ''}. Check it, or search with legifrance_search_legislation.`;
    }
  }
}

export function registerGetTextTool(
  server: McpServer,
  getText: GetText,
  deadlineMs?: number,
): void {
  server.registerTool(
    'legifrance_get_text',
    {
      title: 'Read a French law, ordinance or decree',
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
        const input: GetTextInput = {
          id: presentOrUndefined(args.id),
          nor: presentOrUndefined(args.nor),
          nature: args.nature,
          number: presentOrUndefined(args.number),
          atDate: presentOrUndefined(args.at_date),
          sectionCid: presentOrUndefined(args.section_id),
        };
        const result = await getText(input, { signal });
        const text = renderGetText(result, {
          part: args.part ?? 'outline',
          page: args.page ?? 1,
          input,
        });
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        return toToolError(err, signal);
      }
    },
  );
}
