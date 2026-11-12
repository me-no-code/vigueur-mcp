import type { IsoDate } from '../../domain/dates.js';
import type { ArticleRef } from '../../domain/relocation.js';
import type { ModificationLink } from '../../domain/status-at.js';
import type { ArticleVersion, LegalStatus } from '../../domain/versions.js';

export interface CallContext {
  signal?: AbortSignal;
}

export interface CodeInfo {
  id: string;
  title: string;
  status: LegalStatus;
}

/** One entry of an article's version stack. Still-born versions keep their (inverted) dates. */
export interface VersionSummary {
  id: string;
  version: string;
  status: LegalStatus;
  rawStatus: string;
  validFrom: IsoDate | null;
  /** `null` = no end date, or an end not determined yet (`validToUndetermined`). */
  validTo: IsoDate | null;
  /** Légifrance records an end (a scheduled repeal) whose date it has not set yet. */
  validToUndetermined: boolean;
}

/** An article version found by number in a code. */
export interface ArticleHit {
  id: string;
  num: string;
  codeId: string;
  codeTitle: string;
  status: LegalStatus;
  rawStatus: string;
  validFrom: IsoDate | null;
  /** `null` = no end date, or an end not determined yet (`validToUndetermined`). */
  validTo: IsoDate | null;
  /** Légifrance records an end (a scheduled repeal) whose date it has not set yet. */
  validToUndetermined: boolean;
}

/** One page of a by-number lookup. */
export interface ArticleHitPage {
  hits: ArticleHit[];
  /** The page Légifrance returned was full: more versions with this number may exist. */
  truncated: boolean;
}

export interface ArticleRecord {
  version: ArticleVersion;
  /** Lineage id: follows the article number, not its content. */
  cid: string;
  codeId: string | null;
  codeTitle: string | null;
  nota: string | null;
  /** Ancestor section titles, outermost first, as they read on the requested date. */
  sectionPath: string[];
  sectionCid: string | null;
  versions: VersionSummary[];
  /** Texts that created, modified or repealed this version. */
  modifications: ModificationLink[];
  /** Number of texts citing the article (the citations themselves are not kept). */
  citationsCount: number;
}

export interface HistoryEntry {
  /** Entry-into-force date; `null` when Légifrance records it as undetermined. */
  date: IsoDate | null;
  undetermined: boolean;
  action: 'creation' | 'modification' | 'abrogation' | 'codification' | 'transfer' | 'other';
  amendingTitle: string;
  amendingArticleId: string | null;
}

export interface Concordance {
  /** Articles whose content now lives at this article. */
  from: ArticleRef[];
  /** Articles where this article's content now lives. */
  to: ArticleRef[];
}

export type LegislationCollection = 'codes' | 'loda' | 'jorf' | 'kali';

export interface LegislationQuery {
  collection: LegislationCollection;
  text?: string;
  codeTitle?: string;
  articleNumber?: string;
  textNumber?: string;
  nor?: string;
  nature?: string;
  idcc?: string;
  atDate: IsoDate;
  includeHistorical: boolean;
  publishedFrom?: IsoDate;
  publishedTo?: IsoDate;
  /** 1-based. */
  page: number;
  /** 1 to 100. */
  pageSize: number;
}

export interface LegislationHit {
  kind: 'article' | 'text';
  id: string;
  textId: string;
  title: string;
  articleNumber: string | null;
  status: LegalStatus;
  rawStatus: string;
  validFrom: IsoDate | null;
  validTo: IsoDate | null;
  snippet: string | null;
  nature: string | null;
  publishedOn: IsoDate | null;
  nor: string | null;
}

export interface LegislationSearchPage {
  total: number;
  page: number;
  pageSize: number;
  hits: LegislationHit[];
}

/** One article touched by one amending text, dated by entry into force. */
export interface ChangeEntry {
  date: IsoDate;
  action: HistoryEntry['action'];
  articleNum: string | null;
  articleId: string | null;
  sectionTitle: string | null;
  amendingTitle: string;
  amendingArticleId: string | null;
}

export interface ChangeLog {
  entries: ChangeEntry[];
  /** Versions of the range whose entry-into-force date Légifrance leaves undetermined. */
  undeterminedCount: number;
  /** Years of the range for which Légifrance did not load the version detail. */
  detailMissingYears: string[];
}

export interface LegislationRepository {
  listCodes(ctx?: CallContext): Promise<CodeInfo[]>;
  /** Versions in force on `date` numbered `num`, in one code or (codeTitle null) in every code. */
  findArticleAt(
    codeTitle: string | null,
    num: string,
    date: IsoDate,
    ctx?: CallContext,
  ): Promise<ArticleHitPage>;
  /** Every version ever numbered `num`, whatever its status. */
  findArticleAllVersions(
    codeTitle: string | null,
    num: string,
    ctx?: CallContext,
  ): Promise<ArticleHitPage>;
  /** `null` when Légifrance has no article with this id. */
  getArticle(id: string, asOf: IsoDate, ctx?: CallContext): Promise<ArticleRecord | null>;
  /** Chronological, undetermined dates last. */
  getArticleHistory(codeId: string, articleCid: string, ctx?: CallContext): Promise<HistoryEntry[]>;
  getConcordance(articleId: string, ctx?: CallContext): Promise<Concordance>;
  searchLegislation(query: LegislationQuery, ctx?: CallContext): Promise<LegislationSearchPage>;
  /** Changes to a code with entry into force in `from..to` (inclusive). */
  listChanges(codeId: string, from: IsoDate, to: IsoDate, ctx?: CallContext): Promise<ChangeLog>;
}
