import { normalizeArticleNumber } from './articles.js';
import { CODE_NAMES, resolveCodeName } from './codes.js';
import { type IsoDate, parseFrenchDate } from './dates.js';
import { foldKey, replaceTypographyChars } from './text.js';

export type CassChamber =
  | 'plenary'
  | 'mixed'
  | 'civ1'
  | 'civ2'
  | 'civ3'
  | 'commercial'
  | 'social'
  | 'criminal';
export type TextNature = 'loi' | 'loi_organique' | 'ordonnance' | 'decret' | 'arrete';
export interface TextRef {
  nature: TextNature;
  number?: string;
  date?: IsoDate;
}
/** `input.slice(start, end) === raw`, indices into the original (non-normalized) input. */
export interface Span {
  raw: string;
  start: number;
  end: number;
}
export type Citation =
  | (Span & { kind: 'code_article'; article: string; code: string })
  | (Span & { kind: 'text_article'; article: string; text: TextRef })
  | (Span & { kind: 'text'; text: TextRef })
  | (Span & { kind: 'cass_decision'; pourvoi: string; chamber?: CassChamber; date?: IsoDate })
  | (Span & { kind: 'ce_decision'; number: string; date?: IsoDate })
  | (Span & { kind: 'ecli'; ecli: string });

// Patterns run on replaceTypographyChars(input), which has exactly the length of input, so match
// indices are indices into the original text. Space runs and NBSP are absorbed by \s.
const L = '(?<![\\p{L}\\p{N}])'; // left word boundary
const R = '(?![\\p{L}\\p{N}])'; // right word boundary
const DOT = `(?:\\.|${R})`; // end of an abbreviation: its dot, or at least a word boundary
const NUMBER_END = '(?!\\d|[-.]\\d)';
const NUMBER_SIGN = '[Nn]\\s*°\\s*';
// Whitespace with at most one comma. Each optional component carries its own trailing SEP, so
// two quantifiers never compete for the same whitespace run (no catastrophic backtracking).
const SEP = '\\s*(?:,\\s*)?';

// Latin series: bis … nonies, then (un|duo|ter…)decies and …vicies ("199 undecies B").
const LATIN =
  '(?:bis|ter|quater|quinquies|sexies|septies|octies|nonies|novies|(?:un|duo|ter|tre|quater|quattuor|quin|quinquies|sex|sexies|sept|septies|octo|octies|novo|novies|duode|unde)?(?:decies|vicies))';
// "L. 1234-1", "6 bis", "150-0 A" (CGI capital-letter suffix), "199 terdecies-0 A", "premier".
const ARTICLE_NUMBER = `${L}(?:premier|1er|(?:(?:L\\.?\\s*O|[LRDA])\\.?\\s*)?\\d+(?:-\\d+)*(?:\\s+${LATIN}(?:-\\d+)*)?(?:\\s+[A-Z])?)(?![\\p{L}\\p{N}]|-\\d)`;
const ARTICLES = `${L}(?:[Aa]rticles?|[Aa]rts?\\.)\\s*`;
const AND_TO = '\\s+(?:et|à)\\s+';
const ARTICLE_LIST = `${ARTICLE_NUMBER}(?:(?:\\s*,\\s*|${AND_TO})${ARTICLE_NUMBER})*`;
// What may follow a code-first citation: punctuation, end of line/input, "et"/"à" not followed by
// another article, or an alinéa. Positive, so a shortened list or dropped suffix cannot pass.
const LIST_END = `(?=[^\\S\\n]*(?:[\\n,;:.!?()\\[\\]"«»”]|$)|${AND_TO}(?!${ARTICLE_NUMBER})|\\s+al(?:\\.|inéa))`;

const MONTH =
  '(?:janvier|janv|f[ée]vrier|f[ée]vr|mars|avril|avr|mai|juin|juillet|juil|ao[ûu]t|septembre|sept|octobre|oct|novembre|nov|d[ée]cembre|d[ée]c)';
const DATE = `${L}(?:1er|\\d{1,2})\\s+${MONTH}\\.?\\s+\\d{4}(?!\\d)`;

const NATURE = `${L}(?:[Ll]oi\\s+organique|[Ll]oi|[Oo]rdonnance|[Dd][ée]cret|[Aa]rr[êe]t[ée])${R}`;
// Number and date are both optional here; textRef() rejects a bare nature ("la loi").
const TEXT = `(?<nature>${NATURE})(?:\\s+${NUMBER_SIGN}(?<number>\\d{2,4}-\\d{1,5})${NUMBER_END})?(?:\\s+du\\s+(?<date>${DATE}))?`;

const ACCENTS: Readonly<Record<string, string>> = {
  a: 'àâä',
  c: 'ç',
  e: 'éèêë',
  i: 'îï',
  o: 'ôö',
  u: 'ùûü',
};

/** Regex source for one CODE_NAMES spelling: any case/accents, optional dots, flexible spaces. */
function codeNamePattern(name: string): string {
  if (/^[A-Z]+$/.test(name)) return name; // acronyms (CPC, CGI…) stay case-sensitive
  return name.replace(/\. |[.' ]|\p{L}/gu, (part) => {
    if (part === '. ') return '(?:\\.\\s*|\\s+)';
    if (part === '.') return '\\.?';
    if (part === ' ') return '\\s+';
    if (part === "'") return "'\\s*";
    const base = part.normalize('NFD').charAt(0).toLowerCase();
    const variants = base + (ACCENTS[base] ?? '');
    return `[${variants}${variants.toUpperCase()}]`;
  });
}

const CODE_ALTERNATIVES = [...CODE_NAMES]
  .sort((a, b) => b.length - a.length)
  .map(codeNamePattern)
  .join('|');
const CODE = `(?<code>${L}(?:${CODE_ALTERNATIVES})${R})`;
// A known title followed by one of these words names another code: "Code civil local",
// "Code pénal local", "Code du travail applicable à Mayotte", "Code du travail maritime".
const NOT_ANOTHER_CODE = `(?!\\s+(?:local|applicable|maritime)${R})`;

const CASS = `[Cc]ass${DOT}`;
const ORDINAL = '[123](?:ère|re|ème|e)';
const CHAMBER = `(?:[Aa]ss${DOT}\\s*pl[ée]n${DOT}|[Cc]h${DOT}\\s*mixte${R}|[Cc]iv${DOT}\\s*${ORDINAL}${R}|${ORDINAL}\\s*[Cc]iv${DOT}|[Cc]om${DOT}|[Ss]oc${DOT}|[Cc]rim${DOT})`;

const NATURES: Readonly<Record<string, TextNature>> = {
  loi: 'loi',
  loiorganique: 'loi_organique',
  ordonnance: 'ordonnance',
  decret: 'decret',
  arrete: 'arrete',
};
const CHAMBERS: Readonly<Record<string, CassChamber>> = {
  assplen: 'plenary',
  chmixte: 'mixed',
  com: 'commercial',
  soc: 'social',
  crim: 'criminal',
  1: 'civ1',
  2: 'civ2',
  3: 'civ3',
};

type Groups = Partial<Record<string, string>>;

const ARTICLE_NUMBER_GLOBAL = new RegExp(ARTICLE_NUMBER, 'gu');

function articlesIn(list = ''): string[] {
  return Array.from(list.matchAll(ARTICLE_NUMBER_GLOBAL), (m) => normalizeArticleNumber(m[0]));
}

function textRef(g: Groups): TextRef | null {
  const nature = NATURES[foldKey(g.nature ?? '')];
  const date = g.date ? parseFrenchDate(g.date) : null;
  if (!nature || (!g.number && !date)) return null;
  // Without a number, "ordonnance du <date>" is almost always a judge's order, not a text.
  if (nature === 'ordonnance' && !g.number) return null;
  return { nature, ...(g.number ? { number: g.number } : {}), ...(date ? { date } : {}) };
}

function codeArticles(g: Groups, span: Span): Citation[] {
  const code = g.code ? resolveCodeName(g.code) : null;
  if (!code) return [];
  return articlesIn(g.articles).map((article) => ({
    kind: 'code_article',
    article,
    code,
    ...span,
  }));
}

function textArticles(g: Groups, span: Span): Citation[] {
  const text = textRef(g);
  if (!text) return [];
  return articlesIn(g.articles).map((article) => ({
    kind: 'text_article',
    article,
    text: { ...text },
    ...span,
  }));
}

function cassDecision(g: Groups, span: Span): Citation[] {
  // CHAMBERS keys: folded chamber name, or the ordinal digit of a civil chamber.
  const key = foldKey(g.chamber ?? '');
  const chamber = CHAMBERS[/[123]/.exec(key)?.[0] ?? key];
  const date = g.date ? parseFrenchDate(g.date) : null;
  const pourvoi = `${g.year}-${g.series}.${g.serial}`;
  return [
    {
      kind: 'cass_decision',
      pourvoi,
      ...(chamber ? { chamber } : {}),
      ...(date ? { date } : {}),
      ...span,
    },
  ];
}

function ceDecision(g: Groups, span: Span): Citation[] {
  const date = g.date ? parseFrenchDate(g.date) : null;
  return [{ kind: 'ce_decision', number: g.number ?? '', ...(date ? { date } : {}), ...span }];
}

interface Rule {
  pattern: RegExp;
  build: (groups: Groups, span: Span, match: string) => Citation[];
}

const rule = (source: string, build: Rule['build']): Rule => ({
  pattern: new RegExp(source, 'gu'),
  build,
});

const RULES: readonly Rule[] = [
  // "article L. 1234-1 du Code du travail", "art. 1240 C. civ."
  rule(
    `${ARTICLES}(?<articles>${ARTICLE_LIST})(?:\\s*,\\s*|\\s+)(?:du\\s+)?${CODE}${NOT_ANOTHER_CODE}`,
    codeArticles,
  ),
  // "C. trav., art. L1234-5" — must end at LIST_END, so "C. civ., art. 9 bis de la loi …" fails
  rule(
    `${CODE}\\s*,\\s*${ARTICLES}(?<articles>${ARTICLE_NUMBER}(?:${AND_TO}${ARTICLE_NUMBER})*)${LIST_END}`,
    codeArticles,
  ),
  // "article 9 de la loi n° 78-17 du 6 janvier 1978"
  rule(
    `${ARTICLES}(?<articles>${ARTICLE_LIST})\\s+(?:du\\s+|de\\s+la\\s+|de\\s+l'\\s*)${TEXT}`,
    textArticles,
  ),
  // "ordonnance n° 2016-131 du 10 février 2016"
  rule(TEXT, (g, span) => {
    const text = textRef(g);
    return text ? [{ kind: 'text', text, ...span }] : [];
  }),
  // "Cass. soc., 12 mars 2024, n° 22-12.345", "Soc., …" — the lookahead requires a court or
  // chamber, the pourvoi number is mandatory.
  rule(
    `${L}(?=${CASS}|${CHAMBER})(?:${CASS}${SEP})?(?:(?<chamber>${CHAMBER})${SEP})?(?:(?<date>${DATE})${SEP})?(?:[Pp]ourvoi\\s+)?${NUMBER_SIGN}(?<year>\\d{2})-(?<series>\\d{2})\\.?(?<serial>\\d{3})${NUMBER_END}`,
    cassDecision,
  ),
  // "CE, 10 oct. 2023, n° 463211" — not "règlement CE n° 1346/2000"
  rule(
    `${L}CE(?:\\s*,\\s*|\\s+)(?:(?<date>${DATE})${SEP})?${NUMBER_SIGN}(?<number>\\d{4,6})(?![\\d/]|[-.]\\d)`,
    ceDecision,
  ),
  // "ECLI:FR:CCASS:2024:SO00321"
  rule(`${L}ECLI:[A-Z]{2}:[A-Z0-9.]{1,7}:\\d{4}:[A-Z0-9.]*[A-Z0-9]${R}`, (_g, span, ecli) => [
    { kind: 'ecli', ecli, ...span },
  ]),
];

/**
 * Extracts legal citations from free French text, sorted by start. A multi-article citation
 * ("articles 1240 et 1241 du Code civil") yields one citation per article, all sharing the span
 * of the whole phrase. When matches overlap, the one starting first (then the longest) wins, so
 * the text inside "article 9 de la loi n° …" is not reported again on its own.
 */
export function parseCitations(input: string): Citation[] {
  const text = replaceTypographyChars(input);
  const found: { start: number; end: number; citations: Citation[] }[] = [];
  for (const { pattern, build } of RULES) {
    for (const m of text.matchAll(pattern)) {
      const start = m.index;
      const end = start + m[0].length;
      const citations = build(m.groups ?? {}, { raw: input.slice(start, end), start, end }, m[0]);
      if (citations.length > 0) found.push({ start, end, citations });
    }
  }
  found.sort((a, b) => a.start - b.start || b.end - a.end);

  const result: Citation[] = [];
  let covered = 0;
  for (const { start, end, citations } of found) {
    if (start < covered) continue;
    result.push(...citations);
    covered = end;
  }
  return result;
}
