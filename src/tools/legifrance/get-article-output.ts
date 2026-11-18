import * as z from 'zod/v4';
import type { ModificationLink } from '../../domain/status-at.js';
import type { GetArticleResult } from '../../services/legislation/get-article.js';
import {
  type AnswerBody,
  answerSchema,
  dateSchema,
  fromSchema,
  legifranceLinkSchema,
  legifranceStatusSchema,
  nextSchema,
  partSchema,
  pointerSchema,
  statusSchema,
  untilSchema,
  untilUndeterminedSchema,
} from '../envelope.js';

export const TOOL = 'legifrance_get_article';
export const SOURCE = 'Légifrance';

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

export const MODIFICATION_ACTIONS: Readonly<
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

export type GetArticleAnswer = AnswerBody<z.input<typeof getArticleOutput>>;
export type FoundAnswer = AnswerBody<z.input<typeof foundBranch>>;
export type NotInForceAnswer = AnswerBody<z.input<typeof notInForceBranch>>;
export type LookupMissAnswer = AnswerBody<z.input<(typeof lookupMissBranches)[number]>>;

/** A lookup that found no single article: several candidates, or none. */
export type LookupMiss = Extract<GetArticleResult, { kind: 'ambiguous' | 'not_found' }>;
