import * as z from 'zod/v4';
import type { ChangeKind } from '../../domain/changes.js';
import type { Relocation } from '../../domain/relocation.js';
import type { ModificationLink, StatusAt } from '../../domain/status-at.js';
import type { ArticleVersion, LegalStatus } from '../../domain/versions.js';
import type { ArticleView, GetArticleResult } from '../../services/legislation/get-article.js';
import type { ArticleRecord } from '../../services/legislation/ports.js';

// Zod mirrors of the tools' structured outputs, used as `outputSchema`s. The enum tables are
// typed `{ [K in Union]: K }` so the compiler flags a value added to (or removed from) a union.

/** Which part of the article text the text answer carries; offsets index that text. */
export interface TextPage {
  offset: number;
  /** Where the next page starts; `null` on the last page. */
  nextOffset: number | null;
  totalLength: number;
}

/** `T` with the type of its key `K` replaced by `V`. */
type Replace<T, K extends keyof T, V> = { [P in keyof T]: P extends K ? V : T[P] };

/** An article as structured output: everything but its text, which only the text answer carries. */
export type ArticleOutput = Replace<
  ArticleView,
  'record',
  Replace<ArticleRecord, 'version', Omit<ArticleVersion, 'text'>>
>;

/** `legifrance_get_article` structured content: the service result, the article text left out. */
export type GetArticleOutput =
  | { kind: 'found'; article: ArticleOutput; textPage: TextPage }
  | Exclude<GetArticleResult, { kind: 'found' }>;

const LEGAL_STATUSES: { [K in LegalStatus]: K } = {
  in_force: 'in_force',
  deferred: 'deferred',
  repeal_pending: 'repeal_pending',
  amended: 'amended',
  repealed: 'repealed',
  stillborn: 'stillborn',
  annulled: 'annulled',
  severed: 'severed',
  expired: 'expired',
  transferred: 'transferred',
  replaced: 'replaced',
  denounced: 'denounced',
  initial: 'initial',
  unknown: 'unknown',
};

const STATUS_REASONS: { [K in StatusAt['reason']]: K } = {
  in_force: 'in_force',
  not_yet_in_force: 'not_yet_in_force',
  ended: 'ended',
  never_applied: 'never_applied',
};

const LINK_KINDS: { [K in ModificationLink['kind']]: K } = {
  creation: 'creation',
  modification: 'modification',
  abrogation: 'abrogation',
  codification: 'codification',
  other: 'other',
};

const CHANGE_KINDS: { [K in ChangeKind]: K } = {
  unchanged: 'unchanged',
  amended: 'amended',
  replaced: 'replaced',
};

const EVIDENCE: { [K in Relocation['evidence'][number]]: K } = {
  concordance: 'concordance',
  text_similarity: 'text_similarity',
  section_change: 'section_change',
};

/** `YYYY-MM-DD`. */
const date = z.string();
const legalStatus = z
  .enum(LEGAL_STATUSES)
  .describe('Status computed from the Légifrance label (rawStatus).');

export const versionSummarySchema = z.object({
  id: z.string(),
  version: z.string(),
  status: legalStatus,
  rawStatus: z.string(),
  validFrom: date.nullable(),
  validTo: date.nullable().describe('null = open-ended or undetermined end.'),
});

export const articleHitSchema = z.object({
  id: z.string(),
  num: z.string(),
  codeId: z.string(),
  codeTitle: z.string(),
  status: legalStatus,
  rawStatus: z.string(),
  validFrom: date.nullable(),
  validTo: date.nullable(),
});

export const articleRefSchema = z.object({
  id: z.string(),
  num: z.string().nullable(),
  codeTitle: z.string().nullable(),
  label: z.string(),
});

const articleRecordSchema = z.object({
  version: z.object({
    id: z.string(),
    number: z.string(),
    status: legalStatus,
    rawStatus: z.string().optional(),
    validFrom: date,
    validTo: date.nullable(),
  }),
  cid: z.string(),
  codeId: z.string().nullable(),
  codeTitle: z.string().nullable(),
  nota: z.string().nullable(),
  sectionPath: z.array(z.string()),
  sectionCid: z.string().nullable(),
  versions: z.array(versionSummarySchema),
  modifications: z.array(
    z.object({
      kind: z.enum(LINK_KINDS),
      textTitle: z.string(),
      effectiveDate: date.nullable(),
    }),
  ),
  citationsCount: z.number().int(),
});

const articleViewSchema = z.object({
  record: articleRecordSchema,
  asOf: date,
  statusAt: z.object({
    inForce: z.boolean(),
    reason: z.enum(STATUS_REASONS),
    from: date.nullable(),
    until: date.nullable(),
  }),
  warnings: z.array(z.string()),
  url: z.string(),
  relocation: z
    .object({
      change: z.enum(CHANGE_KINDS),
      movedTo: z.array(articleRefSchema),
      evidence: z.array(z.enum(EVIDENCE)),
      from: versionSummarySchema,
      successor: versionSummarySchema.nullable(),
    })
    .nullable(),
});

export const ambiguousSchema = z.object({
  kind: z.literal('ambiguous'),
  num: z.string(),
  candidates: z.array(articleHitSchema),
  possiblyIncomplete: z.boolean().optional(),
});

export const notFoundSchema = z.object({
  kind: z.literal('not_found'),
  num: z.string().nullable(),
  codeTitle: z.string().nullable(),
  didYouMean: z.array(z.string()),
});

const textPageSchema = z.object({
  offset: z.number().int(),
  nextOffset: z
    .number()
    .int()
    .nullable()
    .describe('Pass as "offset" to read the rest of the article text; null on the last page.'),
  totalLength: z.number().int().describe('Length of the article text, in characters.'),
});

export const getArticleOutputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('found'), article: articleViewSchema, textPage: textPageSchema }),
  ambiguousSchema,
  z.object({
    kind: z.literal('not_in_force_at_date'),
    num: z.string(),
    codeTitle: z.string().nullable(),
    asOf: date,
    periods: z.array(articleHitSchema),
  }),
  notFoundSchema,
]) satisfies z.ZodType<GetArticleOutput>;
