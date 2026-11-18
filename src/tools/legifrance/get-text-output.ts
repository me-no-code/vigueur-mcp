import * as z from 'zod/v4';
import {
  type AnswerBody,
  answerSchema,
  dateSchema,
  legifranceLinkSchema,
  legifranceStatusSchema,
  natureSchema,
  nextSchema,
  norSchema,
  pageSchema,
  pointerSchema,
  publishedSchema,
  sectionSchema,
  statusSchema,
} from '../envelope.js';

export const TOOL = 'legifrance_get_text';
export const SOURCE = 'Légifrance';
export const PARTS = ['outline', 'articles'] as const;
export type Part = (typeof PARTS)[number];

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
  section: sectionSchema
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
export type TextAnswer = AnswerBody<z.input<typeof foundBranch | typeof noResultsBranch>>;
export type Item = TextAnswer['items'][number];
export type SectionItem = Extract<Item, { type: 'section' }>;
export type ArticleItem = Extract<Item, { type: 'article' }>;
export type TextCandidate = z.input<typeof textCandidateSchema>;
