import type { IsoDate } from '../../src/domain/dates.js';
import { type ModificationLink, statusAt } from '../../src/domain/status-at.js';
import type { LegalStatus } from '../../src/domain/versions.js';
import type {
  ArticleHit,
  ArticleRecord,
  CallContext,
  CodeInfo,
  CodeToc,
  Concordance,
  HistoryEntry,
  LegislationHit,
  LegislationQuery,
  LegislationRepository,
  SectionLinks,
  TextRecord,
  VersionSummary,
} from '../../src/services/legislation/ports.js';

/** When the fake's cached lists (codes, tables of contents) were fetched. */
export const FAKE_FETCHED_AT = new Date('2026-11-10T08:00:00Z');

/** A sample of `/list/code` (real ids and titles), deliberately not sorted by title. */
export const DEFAULT_CODES: readonly CodeInfo[] = [
  { id: 'LEGITEXT000006072050', title: 'Code du travail', status: 'in_force' },
  { id: 'LEGITEXT000006070721', title: 'Code civil', status: 'in_force' },
  { id: 'LEGITEXT000006072051', title: 'Code du travail maritime', status: 'in_force' },
  { id: 'LEGITEXT000006072665', title: 'Code de la santé publique', status: 'in_force' },
  { id: 'LEGITEXT000006069577', title: 'Code général des impôts', status: 'in_force' },
  { id: 'LEGITEXT000006072052', title: 'Code du travail applicable à Mayotte', status: 'repealed' },
  { id: 'LEGITEXT000005634379', title: 'Code de commerce', status: 'in_force' },
  { id: 'LEGITEXT000006070719', title: 'Code pénal', status: 'in_force' },
];

const RAW_STATUS: Partial<Record<LegalStatus, string>> = {
  in_force: 'VIGUEUR',
  deferred: 'VIGUEUR_DIFF',
  repeal_pending: 'ABROGE_DIFF',
  amended: 'MODIFIE',
  repealed: 'ABROGE',
  stillborn: 'MODIFIE_MORT_NE',
};

export interface ArticleSeed {
  id: string;
  num: string;
  /** Default `Code civil`; its `codeId` defaults to the matching `DEFAULT_CODES` entry. */
  codeTitle?: string | null;
  codeId?: string | null;
  text?: string;
  status?: LegalStatus;
  rawStatus?: string;
  validFrom?: IsoDate;
  validTo?: IsoDate | null;
  /** Légifrance records an end whose date is not determined yet (`validTo` stays null). */
  validToUndetermined?: boolean;
  /** Version label shown in `versions` (default `1.0`). */
  version?: string;
  cid?: string;
  nota?: string | null;
  sectionPath?: string[];
  sectionCid?: string | null;
  modifications?: ModificationLink[];
  citationsCount?: number;
  /** Default: the article's own summary only (use `lineage` to share a version stack). */
  versions?: VersionSummary[];
}

/** An `ArticleRecord` for one article version, with sensible defaults (in force since 2000). */
export function makeArticle(seed: ArticleSeed): ArticleRecord {
  const status = seed.status ?? 'in_force';
  const rawStatus = seed.rawStatus ?? RAW_STATUS[status] ?? status.toUpperCase();
  const validFrom = seed.validFrom ?? '2000-01-01';
  const validTo = seed.validTo ?? null;
  const validToUndetermined = seed.validToUndetermined ?? false;
  const codeTitle = seed.codeTitle === undefined ? 'Code civil' : seed.codeTitle;
  const codeId =
    seed.codeId === undefined
      ? (DEFAULT_CODES.find((c) => c.title === codeTitle)?.id ?? null)
      : seed.codeId;
  const own: VersionSummary = {
    id: seed.id,
    version: seed.version ?? '1.0',
    status,
    rawStatus,
    validFrom,
    validTo,
    validToUndetermined,
  };
  return {
    version: {
      id: seed.id,
      number: seed.num,
      text: seed.text ?? `Texte de l'article ${seed.num}.`,
      status,
      rawStatus,
      validFrom,
      validTo,
      ...(validToUndetermined && { validToUndetermined }),
    },
    cid: seed.cid ?? seed.id,
    textId: codeId,
    textTitle: codeTitle,
    nota: seed.nota ?? null,
    sectionPath: seed.sectionPath ?? [],
    sectionCid: seed.sectionCid ?? null,
    versions: seed.versions ?? [own],
    modifications: seed.modifications ?? [],
    citationsCount: seed.citationsCount ?? 0,
  };
}

/** The record's own entry of its version stack. */
export function summaryOf(record: ArticleRecord): VersionSummary {
  const listed = record.versions.find((v) => v.id === record.version.id);
  if (listed) return listed;
  const { id, status, rawStatus, validFrom, validTo, validToUndetermined } = record.version;
  return {
    id,
    version: '',
    status,
    rawStatus: rawStatus ?? '',
    validFrom,
    validTo,
    validToUndetermined: validToUndetermined ?? false,
  };
}

/** The given versions of one article, each carrying the whole stack in `versions`. */
export function lineage<T extends ArticleRecord[]>(
  ...records: T
): { [K in keyof T]: ArticleRecord } {
  const versions = records.map(summaryOf);
  return records.map((r) => ({ ...r, versions })) as { [K in keyof T]: ArticleRecord };
}

/** The by-number search hit for a seeded article version. */
export function hitOf(record: ArticleRecord): ArticleHit {
  const { id, number, status, rawStatus, validFrom, validTo, validToUndetermined } = record.version;
  return {
    id,
    num: number,
    codeId: record.textId ?? '',
    codeTitle: record.textTitle ?? '',
    status,
    rawStatus: rawStatus ?? '',
    validFrom,
    validTo,
    validToUndetermined: validToUndetermined ?? false,
  };
}

/** Arguments of each repository method, without the trailing `ctx`. */
export interface RepositoryArgs {
  listCodes: [];
  findArticleAt: [codeTitle: string | null, num: string, date: IsoDate];
  findArticleAllVersions: [codeTitle: string | null, num: string];
  getArticle: [id: string, asOf: IsoDate];
  getArticleHistory: [codeId: string, articleCid: string];
  getConcordance: [articleId: string];
  searchLegislation: [query: LegislationQuery];
  listChanges: [codeId: string, from: IsoDate, to: IsoDate];
  getText: [textId: string, asOf: IsoDate];
  getJorfText: [textCid: string];
  getJorfTextByNor: [nor: string];
  latestJo: [count: number];
  joIssuesBetween: [from: IsoDate, to: IsoDate];
  joIssue: [id: string];
  jorfFacets: [from: IsoDate, to: IsoDate];
  getCodeToc: [codeId: string, asOf: IsoDate];
  getSectionLinks: [sectionCid: string];
}

export interface RecordedCall<A> {
  args: A;
  ctx: CallContext | undefined;
}

export type RecordedCalls = { [M in keyof RepositoryArgs]: RecordedCall<RepositoryArgs[M]>[] };

export interface FakeLegislationSeed {
  /** `listCodes` result (default `DEFAULT_CODES`). */
  codes?: readonly CodeInfo[];
  /**
   * Article versions: `getArticle` serves them by version id (`null` otherwise);
   * `findArticleAt` / `findArticleAllVersions` derive hits from them (number compared
   * case- and space-insensitively like the real client, code by exact title, date by the
   * in-force rule), on a page never truncated.
   */
  articles?: readonly ArticleRecord[];
  /** `getConcordance` result by article version id (default: no links). */
  concordance?: Readonly<Record<string, Concordance>>;
  /** `getArticleHistory` result by article cid (default `[]`). */
  history?: Readonly<Record<string, HistoryEntry[]>>;
  /** Whole texts: `getText` / `getJorfText` serve them by id, `getJorfTextByNor` by NOR (`null` otherwise). */
  texts?: readonly TextRecord[];
  /** `getCodeToc` result by code id (default: an empty root). */
  tocs?: Readonly<Record<string, Omit<CodeToc, 'fetchedAt'> & { fetchedAt?: Date }>>;
  /** `getSectionLinks` result by section cid (default `null`). */
  sectionLinks?: Readonly<Record<string, SectionLinks>>;
  /** `searchLegislation` returns these hits (one page; default none). */
  searchHits?: readonly LegislationHit[];
  /** Replaces the seeded behaviour of individual methods; calls are still recorded. */
  overrides?: Partial<LegislationRepository>;
}

const numKey = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

/** An in-memory `LegislationRepository` that records every call (arguments and `ctx`). */
export function fakeLegislation(seed: FakeLegislationSeed = {}): {
  repo: LegislationRepository;
  calls: RecordedCalls;
} {
  const codes = seed.codes ?? DEFAULT_CODES;
  const articles = seed.articles ?? [];
  const byNumber = (codeTitle: string | null, num: string) =>
    articles.filter(
      (a) =>
        numKey(a.version.number) === numKey(num) &&
        (codeTitle === null || a.textTitle === codeTitle),
    );

  const seeded: LegislationRepository = {
    async listCodes() {
      return { codes: codes.map((c) => ({ ...c })), fetchedAt: FAKE_FETCHED_AT };
    },
    async findArticleAt(codeTitle, num, date) {
      const hits = byNumber(codeTitle, num)
        .filter((a) => statusAt(a.version, date).inForce)
        .map(hitOf);
      return { hits, truncated: false };
    },
    async findArticleAllVersions(codeTitle, num) {
      return { hits: byNumber(codeTitle, num).map(hitOf), truncated: false };
    },
    async getArticle(id) {
      const found = articles.find((a) => a.version.id === id);
      return found ? structuredClone(found) : null;
    },
    async getArticleHistory(_codeId, articleCid) {
      return structuredClone(seed.history?.[articleCid] ?? []);
    },
    async getConcordance(articleId) {
      return structuredClone(seed.concordance?.[articleId] ?? { from: [], to: [] });
    },
    async searchLegislation(query) {
      const hits = structuredClone([...(seed.searchHits ?? [])]);
      return { total: hits.length, page: query.page, pageSize: query.pageSize, hits };
    },
    async listChanges() {
      return { entries: [], undeterminedCount: 0, detailMissingYears: [] };
    },
    async getText(textId) {
      const found = (seed.texts ?? []).find((t) => t.id === textId);
      return found ? structuredClone(found) : null;
    },
    async getJorfText(textCid) {
      const found = (seed.texts ?? []).find((t) => t.id === textCid || t.cid === textCid);
      return found ? structuredClone(found) : null;
    },
    async getJorfTextByNor(nor) {
      const found = (seed.texts ?? []).find((t) => t.nor === nor);
      return found ? structuredClone(found) : null;
    },
    async latestJo() {
      return [];
    },
    async joIssuesBetween() {
      return [];
    },
    async joIssue() {
      return null;
    },
    async jorfFacets() {
      return { natures: [], emitters: [] };
    },
    async getCodeToc(codeId, asOf) {
      const seededToc = seed.tocs?.[codeId];
      if (seededToc) return { fetchedAt: FAKE_FETCHED_AT, ...seededToc };
      const root = {
        cid: codeId,
        title: '',
        status: 'in_force' as const,
        validFrom: null,
        validTo: null,
        children: [],
        articles: [],
      };
      return { codeId, codeTitle: '', asOf, root, fetchedAt: FAKE_FETCHED_AT };
    },
    async getSectionLinks(sectionCid) {
      return seed.sectionLinks?.[sectionCid] ?? null;
    },
  };
  const impl: LegislationRepository = { ...seeded, ...seed.overrides };

  const calls: RecordedCalls = {
    listCodes: [],
    findArticleAt: [],
    findArticleAllVersions: [],
    getArticle: [],
    getArticleHistory: [],
    getConcordance: [],
    searchLegislation: [],
    listChanges: [],
    getText: [],
    getJorfText: [],
    getJorfTextByNor: [],
    latestJo: [],
    joIssuesBetween: [],
    joIssue: [],
    jorfFacets: [],
    getCodeToc: [],
    getSectionLinks: [],
  };

  const repo: LegislationRepository = {
    listCodes(ctx) {
      calls.listCodes.push({ args: [], ctx });
      return impl.listCodes(ctx);
    },
    findArticleAt(codeTitle, num, date, ctx) {
      calls.findArticleAt.push({ args: [codeTitle, num, date], ctx });
      return impl.findArticleAt(codeTitle, num, date, ctx);
    },
    findArticleAllVersions(codeTitle, num, ctx) {
      calls.findArticleAllVersions.push({ args: [codeTitle, num], ctx });
      return impl.findArticleAllVersions(codeTitle, num, ctx);
    },
    getArticle(id, asOf, ctx) {
      calls.getArticle.push({ args: [id, asOf], ctx });
      return impl.getArticle(id, asOf, ctx);
    },
    getArticleHistory(codeId, articleCid, ctx) {
      calls.getArticleHistory.push({ args: [codeId, articleCid], ctx });
      return impl.getArticleHistory(codeId, articleCid, ctx);
    },
    getConcordance(articleId, ctx) {
      calls.getConcordance.push({ args: [articleId], ctx });
      return impl.getConcordance(articleId, ctx);
    },
    searchLegislation(query, ctx) {
      calls.searchLegislation.push({ args: [query], ctx });
      return impl.searchLegislation(query, ctx);
    },
    listChanges(codeId, from, to, ctx) {
      calls.listChanges.push({ args: [codeId, from, to], ctx });
      return impl.listChanges(codeId, from, to, ctx);
    },
    getText(textId, asOf, ctx) {
      calls.getText.push({ args: [textId, asOf], ctx });
      return impl.getText(textId, asOf, ctx);
    },
    getJorfText(textCid, ctx) {
      calls.getJorfText.push({ args: [textCid], ctx });
      return impl.getJorfText(textCid, ctx);
    },
    getJorfTextByNor(nor, ctx) {
      calls.getJorfTextByNor.push({ args: [nor], ctx });
      return impl.getJorfTextByNor(nor, ctx);
    },
    latestJo(count, ctx) {
      calls.latestJo.push({ args: [count], ctx });
      return impl.latestJo(count, ctx);
    },
    joIssuesBetween(from, to, ctx) {
      calls.joIssuesBetween.push({ args: [from, to], ctx });
      return impl.joIssuesBetween(from, to, ctx);
    },
    joIssue(id, ctx) {
      calls.joIssue.push({ args: [id], ctx });
      return impl.joIssue(id, ctx);
    },
    jorfFacets(from, to, ctx) {
      calls.jorfFacets.push({ args: [from, to], ctx });
      return impl.jorfFacets(from, to, ctx);
    },
    getCodeToc(codeId, asOf, ctx) {
      calls.getCodeToc.push({ args: [codeId, asOf], ctx });
      return impl.getCodeToc(codeId, asOf, ctx);
    },
    getSectionLinks(sectionCid, ctx) {
      calls.getSectionLinks.push({ args: [sectionCid], ctx });
      return impl.getSectionLinks(sectionCid, ctx);
    },
  };

  return { repo, calls };
}
