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
  /** `null` = open-ended or undetermined end. */
  validTo: IsoDate | null;
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
  validTo: IsoDate | null;
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

export interface LegislationRepository {
  listCodes(ctx?: CallContext): Promise<CodeInfo[]>;
  /** Versions in force on `date` numbered `num`, in one code or (codeTitle null) in every code. */
  findArticleAt(
    codeTitle: string | null,
    num: string,
    date: IsoDate,
    ctx?: CallContext,
  ): Promise<ArticleHit[]>;
  /** Every version ever numbered `num`, whatever its status. */
  findArticleAllVersions(
    codeTitle: string | null,
    num: string,
    ctx?: CallContext,
  ): Promise<ArticleHit[]>;
  /** `null` when Légifrance has no article with this id. */
  getArticle(id: string, asOf: IsoDate, ctx?: CallContext): Promise<ArticleRecord | null>;
  /** Chronological, undetermined dates last. */
  getArticleHistory(codeId: string, articleCid: string, ctx?: CallContext): Promise<HistoryEntry[]>;
  getConcordance(articleId: string, ctx?: CallContext): Promise<Concordance>;
}
