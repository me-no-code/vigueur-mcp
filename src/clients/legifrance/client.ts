import type { IsoDate } from '../../domain/dates.js';
import type { ArticleRef } from '../../domain/relocation.js';
import type { ModificationLink } from '../../domain/status-at.js';
import type { ArticleVersion } from '../../domain/versions.js';
import type {
  ArticleHit,
  ArticleHitPage,
  ArticleRecord,
  CallContext,
  CodeInfo,
  Concordance,
  HistoryEntry,
  LegislationRepository,
  VersionSummary,
} from '../../services/legislation/ports.js';
import { VigueurError } from '../../shared/errors.js';
import type { PisteHttp } from '../piste/http.js';
import { listChanges } from './chrono.js';
import {
  asObj,
  cleanNum,
  HISTORY_ACTIONS,
  keyed,
  list,
  lookup,
  numKey,
  type Obj,
  optStr,
  postJson,
  shape,
  str,
} from './request.js';
import { searchLegislation } from './search.js';
import { mapPisteStatus } from './status-map.js';
import { getJorfText, getJorfTextByNor, getText } from './texts.js';
import { createTocClient } from './toc.js';
import { cleanTitle, htmlToText, parseApiDate, stripIdSuffix, stripMarks } from './wire.js';

const DEFAULT_CODES_TTL_MS = 24 * 60 * 60 * 1000;
const AT_DATE_PAGE_SIZE = 20;
/** The API maximum: one article number can carry dozens of versions (CGI 199 undecies B: 35). */
const ALL_VERSIONS_PAGE_SIZE = 100;

// ---------------------------------------------------------------------------------------------
// Wire reading (guards live in request.ts).

/** HTML converted to text when it yields any, else the plain variant; `''` when both are empty. */
function richText(o: Obj, htmlKey: string, plainKey: string): string {
  const html = optStr(o, htmlKey);
  const fromHtml = html === null ? '' : htmlToText(html);
  return fromHtml !== '' ? fromHtml : (optStr(o, plainKey) ?? '').trim();
}

// ---------------------------------------------------------------------------------------------
// Codes and article search

function mapCodes(body: unknown): CodeInfo[] {
  return list(asObj(body, 'body'), 'results', true).map((c) => ({
    id: stripIdSuffix(optStr(c, 'cid') || str(c, 'id')),
    title: cleanTitle(str(c, 'titre')),
    status: mapPisteStatus(optStr(c, 'etat')),
  }));
}

type SearchFilter =
  | { facette: string; valeurs: string[] }
  | { facette: string; singleDate: IsoDate };

function articleNumberSearch(
  fond: 'CODE_DATE' | 'CODE_ETAT',
  num: string,
  filtres: SearchFilter[],
  pageSize: number,
) {
  return {
    fond,
    recherche: {
      champs: [
        {
          typeChamp: 'NUM_ARTICLE',
          criteres: [{ typeRecherche: 'EXACTE', valeur: num, operateur: 'ET' }],
          operateur: 'ET',
        },
      ],
      filtres,
      pageNumber: 1,
      pageSize,
      operateur: 'ET',
      sort: 'PERTINENCE',
      typePagination: 'ARTICLE',
    },
  };
}

/** The code of a search result: its LEGITEXT title (CODE_ETAT lists section titles first). */
function codeOf(result: Obj): { id: string; title: string } {
  for (const t of list(result, 'titles')) {
    const id = optStr(t, 'cid') || optStr(t, 'id');
    if (id?.startsWith('LEGITEXT')) {
      return { id: stripIdSuffix(id), title: cleanTitle(stripMarks(str(t, 'title'))) };
    }
  }
  throw shape('search result without a code title');
}

/** The hits numbered exactly `num`; the page counts every extract, matching or not. */
function mapArticleHits(body: unknown, num: string, pageSize: number): ArticleHitPage {
  const wanted = numKey(num);
  const hits: ArticleHit[] = [];
  let extracts = 0;
  for (const result of list(asObj(body, 'body'), 'results', true)) {
    for (const section of list(result, 'sections')) {
      for (const extract of list(section, 'extracts')) {
        extracts += 1;
        const extractNum = cleanNum(optStr(extract, 'num') ?? '');
        if (numKey(extractNum) !== wanted) continue;
        const code = codeOf(result);
        const rawStatus = optStr(extract, 'legalStatus') ?? '';
        const end = parseApiDate(extract.dateFin);
        hits.push({
          id: stripIdSuffix(str(extract, 'id')),
          num: extractNum,
          codeId: code.id,
          codeTitle: code.title,
          status: mapPisteStatus(rawStatus),
          rawStatus,
          validFrom: parseApiDate(extract.dateDebut).date,
          validTo: end.date,
          validToUndetermined: end.sentinel === 'undetermined',
        });
      }
    }
  }
  return { hits, truncated: extracts >= pageSize };
}

// ---------------------------------------------------------------------------------------------
// Article

const LINK_KINDS: Readonly<Record<string, ModificationLink['kind']>> = {
  CREATION: 'creation',
  CREE: 'creation',
  MODIFIE: 'modification',
  ABROGE: 'abrogation',
  ABROGATION: 'abrogation',
  CODIFICATION: 'codification',
};

function mapVersionSummary(v: Obj): VersionSummary {
  const rawStatus = optStr(v, 'etat') ?? '';
  const end = parseApiDate(v.dateFin);
  return {
    id: str(v, 'id'),
    version: optStr(v, 'version') ?? '',
    status: mapPisteStatus(rawStatus),
    rawStatus,
    validFrom: parseApiDate(v.dateDebut).date,
    validTo: end.date,
    validToUndetermined: end.sentinel === 'undetermined',
  };
}

function mapModification(l: Obj): ModificationLink {
  return {
    kind: lookup(LINK_KINDS, optStr(l, 'linkType'), 'other'),
    textTitle: cleanTitle(optStr(l, 'textTitle') ?? ''),
    effectiveDate: parseApiDate(l.dateDebutCible).date,
  };
}

interface Heading {
  from: IsoDate | null;
  title: string;
}

const dateKey = (d: IsoDate | null) => d ?? '';

/** Whether the period [from, to) shares a day with the version; an inverted version is its start day. */
function overlapsVersion(
  from: IsoDate | null,
  to: IsoDate | null,
  vFrom: IsoDate,
  vTo: IsoDate | null,
): boolean {
  if (from !== null && to !== null && to <= from) return false; // empty period
  const endsAfterStart = to === null || to > vFrom;
  if (vTo !== null && vTo <= vFrom) return endsAfterStart && (from === null || from <= vFrom);
  return endsAfterStart && (from === null || vTo === null || from < vTo);
}

/**
 * Ancestor section titles of an article version, outermost first. `titresTM` mixes the headings
 * of every version: keep those overlapping this version, then one per depth — the
 * latest already started on `asOf`, or the earliest when `asOf` precedes them all.
 */
function sectionPath(
  titresTM: Obj[],
  vFrom: IsoDate,
  vTo: IsoDate | null,
  asOf: IsoDate,
): string[] {
  const byDepth = new Map<number, Heading[]>();
  for (const t of titresTM) {
    const title = cleanTitle(optStr(t, 'titre') ?? '');
    const from = parseApiDate(t.debut).date;
    if (title === '' || !overlapsVersion(from, parseApiDate(t.fin).date, vFrom, vTo)) continue;
    const depth = (optStr(t, 'xPath') ?? '').split('/').filter((s) => s === 'TM').length;
    byDepth.set(depth, [...(byDepth.get(depth) ?? []), { from, title }]);
  }
  return [...byDepth.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, headings]) => {
      const sorted = [...headings].sort((a, b) =>
        dateKey(a.from) < dateKey(b.from) ? -1 : dateKey(a.from) > dateKey(b.from) ? 1 : 0,
      );
      const started = sorted.filter((h) => dateKey(h.from) <= asOf);
      return (started.at(-1) ?? sorted[0])?.title ?? '';
    });
}

function mapArticle(a: Obj, asOf: IsoDate): ArticleRecord {
  const id = str(a, 'id');
  const versions = list(a, 'articleVersions').map(mapVersionSummary);
  const listed = versions.find((v) => v.id === id);
  const start = parseApiDate(a.dateDebut);
  const end = parseApiDate(a.dateFin);
  const validFrom = start.date ?? listed?.validFrom ?? null;
  if (validFrom === null) {
    throw new VigueurError('upstream_unavailable', `Légifrance: article ${id} has no start date.`, {
      source: 'legifrance',
    });
  }
  // A sentinel end (open-ended, undetermined) is null; only a missing end falls back to the list.
  const endFromList = end.date === null && end.sentinel === 'none';
  const validTo = endFromList ? (listed?.validTo ?? null) : end.date;
  const validToUndetermined = endFromList
    ? listed?.validToUndetermined === true
    : end.sentinel === 'undetermined';
  const rawStatus = optStr(a, 'etat');
  const version: ArticleVersion = {
    id,
    number: optStr(a, 'num') ?? '',
    text: richText(a, 'texteHtml', 'texte'),
    status: mapPisteStatus(rawStatus),
    ...(rawStatus !== null && { rawStatus }),
    validFrom,
    validTo,
    ...(validToUndetermined && { validToUndetermined }),
  };

  const parentText = list(a, 'textTitles')[0];
  const parentId = parentText ? optStr(parentText, 'cid') || optStr(parentText, 'id') : null;
  // `titreLong` is the name /list/code and the NOM_CODE facet use (`titre` can differ: CGI).
  const parentTitle = parentText
    ? optStr(parentText, 'titreLong') || optStr(parentText, 'titre')
    : null;
  const context = a.context === undefined || a.context === null ? {} : asObj(a.context, 'context');

  return {
    version,
    cid: optStr(a, 'cid') || id,
    textId: parentId ? stripIdSuffix(parentId) : null,
    textTitle: parentTitle ? cleanTitle(parentTitle) : null,
    nota: richText(a, 'notaHtml', 'nota') || null,
    sectionPath: sectionPath(list(context, 'titresTM'), validFrom, validTo, asOf),
    sectionCid: optStr(a, 'sectionParentCid'),
    versions,
    modifications: list(a, 'lienModifications').map(mapModification),
    citationsCount: Array.isArray(a.lienCitations) ? a.lienCitations.length : 0,
  };
}

function mapArticleResponse(body: unknown, asOf: IsoDate): ArticleRecord | null {
  const { article } = asObj(body, 'body');
  if (article === null) return null;
  return mapArticle(asObj(article, 'article'), asOf);
}

// ---------------------------------------------------------------------------------------------
// History and concordance

/** Oldest first; entries without a date (undetermined) last. Stable for equal dates. */
function byDate(a: HistoryEntry, b: HistoryEntry): number {
  if (a.date === b.date) return 0;
  if (a.date === null) return 1;
  if (b.date === null) return -1;
  return a.date < b.date ? -1 : 1;
}

function mapHistory(body: unknown): HistoryEntry[] {
  const entries: HistoryEntry[] = [];
  for (const group of list(asObj(body, 'body'), 'regroupements', true)) {
    for (const [key, version] of keyed(group, 'versions')) {
      const fromKey = parseApiDate(key);
      const when =
        fromKey.date === null && fromKey.sentinel === 'none'
          ? parseApiDate(version.dateDebut)
          : fromKey;
      for (const [modifierKey, modifier] of keyed(version, 'articlesModificateurs')) {
        const modifierId = optStr(modifier, 'id') ?? modifierKey;
        for (const [action] of keyed(modifier, 'actions')) {
          entries.push({
            date: when.date,
            undetermined: when.sentinel === 'undetermined',
            action: lookup(HISTORY_ACTIONS, action, 'other'),
            amendingTitle: cleanTitle(optStr(modifier, 'title') ?? ''),
            amendingArticleId:
              modifierId === 'UNKNOWN' || modifierId === '' ? null : stripIdSuffix(modifierId),
          });
        }
      }
    }
  }
  return entries.sort(byDate);
}

/** `Code civil - art. 1240 (V)` → code title and number; the status flag is optional. */
const CONCORDANCE_LABEL = /^(.+?) - art\. (.+?)(?: \([^()]*\))?$/;

function mapArticleRef(e: Obj): ArticleRef {
  const label = cleanTitle(optStr(e, 'name') ?? '');
  const m = CONCORDANCE_LABEL.exec(label);
  return {
    id: stripIdSuffix(str(e, 'id')),
    num: m?.[2] ?? null,
    codeTitle: m?.[1] ?? null,
    label,
  };
}

/** A missing or null list is empty: an article may have links in one direction only. */
function mapConcordance(body: unknown): Concordance {
  const o = asObj(body, 'body');
  return {
    from: list(o, 'oldTexts').map(mapArticleRef),
    to: list(o, 'newTexts').map(mapArticleRef),
  };
}

// ---------------------------------------------------------------------------------------------

export function createLegifranceClient(
  http: PisteHttp,
  opts: { now?: () => Date; codesTtlMs?: number } = {},
): LegislationRepository {
  const now = opts.now ?? (() => new Date());
  const codesTtlMs = opts.codesTtlMs ?? DEFAULT_CODES_TTL_MS;
  const toc = createTocClient(http, now);
  let codes: { fetchedAt: number; list: CodeInfo[] } | null = null;

  const post = <T>(
    path: string,
    body: unknown,
    ctx: CallContext | undefined,
    map: (raw: unknown) => T,
  ) => postJson(http, path, body, ctx, map);

  return {
    async listCodes(ctx) {
      if (codes === null || now().getTime() - codes.fetchedAt >= codesTtlMs) {
        const fetched = await post('/list/code', { pageNumber: 1, pageSize: 200 }, ctx, mapCodes);
        codes = { fetchedAt: now().getTime(), list: fetched };
      }
      return [...codes.list];
    },

    findArticleAt(codeTitle, num, date, ctx) {
      const filtres: SearchFilter[] = [
        ...(codeTitle !== null ? [{ facette: 'NOM_CODE', valeurs: [codeTitle] }] : []),
        { facette: 'DATE_VERSION', singleDate: date },
      ];
      const body = articleNumberSearch('CODE_DATE', num, filtres, AT_DATE_PAGE_SIZE);
      return post('/search', body, ctx, (raw) => mapArticleHits(raw, num, AT_DATE_PAGE_SIZE));
    },

    findArticleAllVersions(codeTitle, num, ctx) {
      const filtres: SearchFilter[] =
        codeTitle !== null ? [{ facette: 'TEXT_NOM_CODE', valeurs: [codeTitle] }] : [];
      const body = articleNumberSearch('CODE_ETAT', num, filtres, ALL_VERSIONS_PAGE_SIZE);
      return post('/search', body, ctx, (raw) => mapArticleHits(raw, num, ALL_VERSIONS_PAGE_SIZE));
    },

    getArticle(id, asOf, ctx) {
      return post('/consult/getArticle', { id }, ctx, (raw) => mapArticleResponse(raw, asOf));
    },

    getArticleHistory(codeId, articleCid, ctx) {
      const body = { textCid: codeId, elementCid: articleCid };
      return post('/chrono/textCidAndElementCid', body, ctx, mapHistory);
    },

    searchLegislation(query, ctx) {
      return searchLegislation(http, query, ctx);
    },

    listChanges(textCid, from, to, ctx) {
      return listChanges(http, textCid, from, to, now(), ctx);
    },

    getText(textId, asOf, ctx) {
      return getText(http, textId, asOf, ctx);
    },

    getJorfText(textCid, ctx) {
      return getJorfText(http, textCid, ctx);
    },

    getJorfTextByNor(nor, ctx) {
      return getJorfTextByNor(http, nor, ctx);
    },

    getCodeToc(codeId, asOf, ctx) {
      return toc.getCodeToc(codeId, asOf, ctx);
    },

    getSectionLinks(sectionCid, ctx) {
      return toc.getSectionLinks(sectionCid, ctx);
    },

    getConcordance(articleId, ctx) {
      return post('/consult/concordanceLinksArticle', { articleId }, ctx, mapConcordance);
    },
  };
}
