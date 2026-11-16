import { type IsoDate, isoDateInParis } from '../../domain/dates.js';
import { coversDate } from '../../domain/status-at.js';
import type {
  CallContext,
  CodeToc,
  SectionLinks,
  TocArticle,
  TocNode,
} from '../../services/legislation/ports.js';
import type { PisteHttp } from '../piste/http.js';
import { asObj, list, type Obj, optStr, postJson, shape, str } from './request.js';
import { mapPisteStatus } from './status-map.js';
import { cleanTitle, parseApiDate, stripIdSuffix } from './wire.js';

// Code tables of contents (/consult/legi/tableMatieres: 19.3 MB for the Code du travail) and
// section links (/consult/getSectionByCid). Only the compact mapped tree is ever kept.

const TOC_CACHE_SIZE = 2;
const TOC_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const order = (o: Obj): number => (typeof o.intOrdre === 'number' ? o.intOrdre : 0);
const byOrder = (a: Obj, b: Obj) => order(a) - order(b);

function mapTocArticle(a: Obj): TocArticle {
  const id = stripIdSuffix(str(a, 'id'));
  const rawStatus = optStr(a, 'etat') ?? '';
  return {
    id,
    cid: optStr(a, 'cid') || id,
    num: optStr(a, 'num')?.trim() || null,
    status: mapPisteStatus(rawStatus),
    rawStatus,
  };
}

function mapNode(s: Obj, title: string, cid: string): TocNode {
  return {
    cid,
    title,
    status: mapPisteStatus(optStr(s, 'etat')),
    validFrom: parseApiDate(s.dateDebut ?? s.dateDebutVersion).date,
    validTo: parseApiDate(s.dateFin ?? s.dateFinVersion).date,
    children: [...list(s, 'sections')].sort(byOrder).map(mapSection),
    articles: [...list(s, 'articles')].sort(byOrder).map(mapTocArticle),
  };
}

function mapSection(s: Obj): TocNode {
  const id = stripIdSuffix(str(s, 'id'));
  return mapNode(s, cleanTitle(optStr(s, 'title') ?? ''), optStr(s, 'cid') || id);
}

function mapToc(raw: unknown, codeId: string, asOf: IsoDate, fetchedAt: Date): CodeToc {
  const o = asObj(raw, 'body');
  const codeTitle = cleanTitle(str(o, 'title'));
  return {
    codeId,
    codeTitle,
    asOf,
    root: mapNode(o, codeTitle, optStr(o, 'cid') || codeId),
    fetchedAt,
  };
}

function mapLinks(raw: unknown, today: IsoDate): SectionLinks | null {
  const versions = list(asObj(raw, 'body'), 'listSection');
  if (versions.length === 0) return null;
  // Half-open like every other version rule (`coversDate`): versions abut, the new one wins.
  let valid: Obj | undefined;
  let validFrom = '';
  for (const c of versions) {
    const from = parseApiDate(c.dateDebut).date;
    const to = parseApiDate(c.dateFin).date;
    if (from !== null && coversDate({ status: 'in_force', validFrom: from, validTo: to }, today)) {
      if (valid === undefined || from > validFrom) {
        valid = c;
        validFrom = from;
      }
    }
  }
  const v = valid ?? versions[0];
  if (v === undefined) throw shape('empty listSection');
  return {
    cid: str(v, 'cid'),
    title: cleanTitle(str(v, 'titre')),
    articles: list(v, 'liensArticle').map((a) => ({
      id: stripIdSuffix(str(a, 'id')),
      status: mapPisteStatus(optStr(a, 'etat')),
      validFrom: parseApiDate(a.dateDebut).date,
      validTo: parseApiDate(a.dateFin).date,
    })),
  };
}

export interface TocClient {
  getCodeToc(codeId: string, asOf: IsoDate, ctx?: CallContext): Promise<CodeToc>;
  getSectionLinks(sectionCid: string, ctx?: CallContext): Promise<SectionLinks | null>;
}

export function createTocClient(http: PisteHttp, now: () => Date): TocClient {
  // Least recently used last; a Map keeps insertion order. Failed fetches are never stored and
  // concurrent first calls may each fetch (as for `listCodes`).
  const cache = new Map<string, CodeToc>();

  return {
    async getCodeToc(codeId, asOf, ctx) {
      const key = `${codeId}|${asOf}`;
      const hit = cache.get(key);
      if (hit !== undefined && now().getTime() - hit.fetchedAt.getTime() < TOC_MAX_AGE_MS) {
        cache.delete(key);
        cache.set(key, hit);
        return hit;
      }
      cache.delete(key);
      const body = { textId: codeId, date: asOf, nature: 'CODE' };
      const toc = await postJson(http, '/consult/legi/tableMatieres', body, ctx, (raw) =>
        mapToc(raw, codeId, asOf, now()),
      );
      cache.set(key, toc);
      while (cache.size > TOC_CACHE_SIZE) {
        const oldest = cache.keys().next().value;
        if (oldest === undefined) break;
        cache.delete(oldest);
      }
      return toc;
    },

    getSectionLinks(sectionCid, ctx) {
      const today = isoDateInParis(now());
      return postJson(http, '/consult/getSectionByCid', { cid: sectionCid }, ctx, (raw) =>
        mapLinks(raw, today),
      );
    },
  };
}
