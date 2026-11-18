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
import type { LegislationHit, TextArticle, TextSection } from '../../services/legislation/ports.js';
import { type Pointer, statusValue } from '../envelope.js';
import { jsonCost, listPage, roomAfter, sliceForJson, WIDE_PAGE } from '../format.js';
import {
  type ArticleItem,
  type GetTextAnswer,
  type Item,
  type Part,
  type SectionItem,
  SOURCE,
  type TextAnswer,
  type TextCandidate,
  TOOL,
} from './get-text-output.js';

/** Most sections or article slices on one page; the character budget usually binds first. */
const MAX_ITEMS = 1_000;

/** Wide stand-ins for the numbers a page budget is measured with, so pages split the same way whatever page is asked. */
const WIDE = WIDE_PAGE;

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

export const isJorf = (textId: string) => textId.startsWith('JORFTEXT');
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

/** What a page of a found text holds besides the text's identity and counts. */
interface PageContent {
  outcome: TextAnswer['outcome'];
  page: TextAnswer['page'];
  next: TextAnswer['next'];
  results: number;
  items: Item[];
  notes: string[];
}

/** A page of a found text: its identity, its article counts (`counts`) and `content`. */
function textPage(
  v: TextView,
  opts: GetTextAnswerOptions,
  counts: Counts,
  content: PageContent,
): TextAnswer {
  const r = v.record;
  const published = asPublished(v);
  const scope = v.focus ?? r;
  return {
    source: SOURCE,
    outcome: content.outcome,
    warnings: [...v.warnings, ...content.notes],
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
    results: content.results,
    page: content.page,
    next: content.next,
    items: content.items,
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
  };
}

/** One page of a found text (`no_results` past the last page). */
function textAnswer(v: TextView, opts: GetTextAnswerOptions): TextAnswer {
  const counts = countArticles(v.focus ?? v.record, v);
  const withheld = `(Text not shown: not in force on ${v.asOf}. Read it with an "at_date" inside its validity, or with legifrance_get_article and its id.)`;
  const page = (content: PageContent) => textPage(v, opts, counts, content);

  // The frame: this answer with no items, its widest numbers and every note it may carry,
  // measured the same for every page asked (the request's page included), so pages split alike.
  const frame = JSON.stringify({
    ...page({
      outcome: 'no_results',
      page: { number: WIDE, of: WIDE },
      next: { page: WIDE },
      results: WIDE,
      items: [],
      notes: opts.part === 'articles' ? [withheld] : [],
    }),
    request: { ...opts.request, page: WIDE },
  });
  const budget = roomAfter(frame);
  const all: Item[] = opts.part === 'outline' ? sectionItems(v) : articleItems(v, budget);
  const paged = listPage(all, opts.page, (item) => jsonCost(item), {
    maxItems: MAX_ITEMS,
    budget,
  });
  const anyWithheld = paged.items.some((i) => i.type === 'article' && i.text === null);
  return page({
    outcome: paged.pastEnd ? 'no_results' : 'found',
    page: { number: opts.page, of: paged.pageCount },
    next: paged.hasMore ? { page: opts.page + 1 } : null,
    results: paged.total,
    items: paged.items,
    notes: anyWithheld ? [withheld] : [],
  });
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
