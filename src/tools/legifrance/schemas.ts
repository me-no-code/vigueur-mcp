import * as z from 'zod/v4';
import type { ChangeKind } from '../../domain/changes.js';
import type { IsoDate } from '../../domain/dates.js';
import type { Relocation } from '../../domain/relocation.js';
import type { ModificationLink, StatusAt } from '../../domain/status-at.js';
import type { ArticleVersion, LegalStatus } from '../../domain/versions.js';
import type { ArticleView, GetArticleResult } from '../../services/legislation/get-article.js';
import type { ArticleHistoryView } from '../../services/legislation/history.js';
import type {
  ArticleRecord,
  ChangeEntry,
  HistoryEntry,
  LegislationHit,
} from '../../services/legislation/ports.js';
import type { NotFoundReason } from '../../services/legislation/resolve.js';

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

const NOT_FOUND_REASONS: { [K in NotFoundReason]: K } = {
  unknown_code: 'unknown_code',
  no_article: 'no_article',
  unknown_id: 'unknown_id',
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

const validTo = date
  .nullable()
  .describe('null = no end date, or an end not determined yet (see validToUndetermined).');
const validToUndetermined = z
  .boolean()
  .describe('true: Légifrance records an end (a scheduled repeal) whose date it has not set yet.');

export const versionSummarySchema = z.object({
  id: z.string(),
  version: z.string(),
  status: legalStatus,
  rawStatus: z.string(),
  validFrom: date.nullable(),
  validTo,
  validToUndetermined,
});

export const articleHitSchema = z.object({
  id: z.string(),
  num: z.string(),
  codeId: z.string(),
  codeTitle: z.string(),
  status: legalStatus,
  rawStatus: z.string(),
  validFrom: date.nullable(),
  validTo,
  validToUndetermined,
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
    validTo,
    validToUndetermined: validToUndetermined.optional(),
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
  reason: z
    .enum(NOT_FOUND_REASONS)
    .describe(
      'unknown_code: no code has the title given (nothing was searched); no_article: no version of the number is on record; unknown_id: no article has the id.',
    ),
  num: z.string().nullable(),
  codeTitle: z
    .string()
    .nullable()
    .describe(
      'The code as typed for unknown_code; otherwise its official title (null: every code).',
    ),
  didYouMean: z
    .array(z.string())
    .describe('Code titles containing the input (unknown_code): suggestions only.'),
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

// ---------------------------------------------------------------------------------------------
// History, search and changes: paged lists. Structured output carries the current page only.

/** Where a page sits in a paged list; `total` counts every item, `hasMore` says to ask for `page + 1`. */
export interface PageInfo {
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

const pageInfoSchema = z.object({
  page: z.number().int(),
  pageSize: z.number().int().describe('Maximum number of items per page.'),
  total: z.number().int().describe('Number of items over all pages.'),
  hasMore: z.boolean().describe('True when "page" + 1 holds more items.'),
});

/** `legifrance_get_article_history` structured content; `history.events` is the current page only. */
export type ArticleHistoryOutput =
  | { kind: 'history'; history: ArticleHistoryView; paging: PageInfo }
  | Extract<GetArticleResult, { kind: 'ambiguous' | 'not_found' }>;

const HISTORY_ACTIONS: { [K in HistoryEntry['action']]: K } = {
  creation: 'creation',
  modification: 'modification',
  abrogation: 'abrogation',
  codification: 'codification',
  transfer: 'transfer',
  other: 'other',
};

const historyEntrySchema = z.object({
  date: date
    .nullable()
    .describe('Entry-into-force date; null when Légifrance leaves it undetermined.'),
  undetermined: z.boolean(),
  action: z.enum(HISTORY_ACTIONS),
  amendingTitle: z.string(),
  amendingArticleId: z.string().nullable(),
});

export const articleHistoryOutputSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('history'),
    history: z.object({
      codeTitle: z.string().nullable(),
      num: z.string(),
      current: versionSummarySchema
        .nullable()
        .describe('Version in force today; null when none is.'),
      versions: z.array(versionSummarySchema),
      events: z.array(historyEntrySchema).describe('The events of the current page.'),
      concordance: z.object({
        from: z.array(articleRefSchema).describe('Articles whose content now lives here.'),
        to: z.array(articleRefSchema).describe("Articles where this article's content now lives."),
      }),
    }),
    paging: pageInfoSchema,
  }),
  ambiguousSchema,
  notFoundSchema,
]) satisfies z.ZodType<ArticleHistoryOutput>;

/** A hit as structured output: snippets are in the text answer only, to keep this small. */
export type SearchHitOutput = Omit<LegislationHit, 'snippet'>;

/** `legifrance_search_legislation` structured content: the hits of the current page. */
export interface SearchOutput {
  paging: PageInfo;
  hits: SearchHitOutput[];
}

const SEARCH_KINDS: { [K in LegislationHit['kind']]: K } = { article: 'article', text: 'text' };

export const searchOutputSchema = z.object({
  paging: pageInfoSchema,
  hits: z.array(
    z.object({
      kind: z.enum(SEARCH_KINDS),
      id: z.string(),
      textId: z.string(),
      title: z.string(),
      articleNumber: z.string().nullable(),
      status: legalStatus,
      rawStatus: z.string(),
      validFrom: date.nullable(),
      validTo: date.nullable(),
      nature: z.string().nullable(),
      publishedOn: date.nullable(),
      nor: z.string().nullable(),
    }),
  ),
}) satisfies z.ZodType<SearchOutput>;

/** A change entry inside its group: the group names the amending text; the section title is in the text answer only. */
export type ChangeEntryOutput = Omit<
  ChangeEntry,
  'amendingTitle' | 'amendingArticleId' | 'sectionTitle'
>;

/** `legifrance_list_changes` structured content: the entries of the current page, by amending text. */
export interface ChangesOutput {
  textTitle: string;
  textId: string;
  since: IsoDate;
  until: IsoDate;
  groups: Array<{
    amendingTitle: string;
    amendingArticleId: string | null;
    entries: ChangeEntryOutput[];
  }>;
  scheduledCount: number;
  undeterminedCount: number;
  detailMissingYears: string[];
  paging: PageInfo;
}

export const changesOutputSchema = z.object({
  textTitle: z.string(),
  textId: z.string(),
  since: date,
  until: date,
  groups: z.array(
    z.object({
      amendingTitle: z.string(),
      amendingArticleId: z.string().nullable(),
      entries: z.array(
        z.object({
          date: date.describe('Entry-into-force date.'),
          action: z.enum(HISTORY_ACTIONS),
          articleNum: z.string().nullable(),
          articleId: z.string().nullable(),
        }),
      ),
    }),
  ),
  scheduledCount: z.number().int().describe('Entries over all pages dated after today.'),
  undeterminedCount: z.number().int(),
  detailMissingYears: z.array(z.string()),
  paging: pageInfoSchema,
}) satisfies z.ZodType<ChangesOutput>;
