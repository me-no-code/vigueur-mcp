import { type IsoDate, isIsoDate } from '../../domain/dates.js';
import {
  CA_LOCATION_LABELS,
  CHAMBER_LABELS,
  CHAMBER_WIRE,
  FORMATION_LABELS,
  JURISDICTION_LABELS,
  PUBLICATION_LABELS,
  SOLUTION_LABELS,
} from '../../domain/judilibre-labels.js';
import type {
  DecisionZone,
  JudilibreDecision,
  JudilibreHit,
  JudilibreQuery,
  JudilibreSearchPage,
  TaxonomyEntry,
  ZoneSegment,
} from '../../services/case-law/ports.js';
import { htmlToText } from '../html.js';
import { asObj, isObj, list, type Obj, optStr, shape, str } from '../json.js';
import { labelled } from './labels.js';

const MAX_HIGHLIGHTS = 2;

/**
 * The `/search` query string. `query` is always sent; `sort` only with `order`; `type` and `theme`
 * are never sent.
 */
export function searchParams(q: JudilibreQuery): Record<string, string | number | undefined> {
  return {
    query: q.query,
    operator: q.operator,
    jurisdiction: q.jurisdiction,
    chamber: q.chamber === undefined ? undefined : CHAMBER_WIRE[q.chamber],
    formation: q.formation,
    publication: q.publication,
    solution: q.solution,
    location: q.location,
    field: q.field,
    date_start: q.dateFrom,
    date_end: q.dateTo,
    sort: q.sort === 'relevance' ? undefined : 'date',
    order: q.sort === 'relevance' ? undefined : q.sort === 'newest' ? 'desc' : 'asc',
    page: q.page,
    page_size: q.pageSize,
  };
}

function strList(o: Obj, key: string): string[] {
  const v = o[key];
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) {
    throw shape(`${key} is not a list of strings`);
  }
  return v as string[];
}

/** `<em>x</em>` to `**x**`, any other tag dropped, whitespace collapsed. */
function cleanHighlight(s: string): string {
  return s
    .replace(/<\/?em>/gi, '**')
    .replace(/<[^<>]*>/g, '') // `[^<>]`: linear on unclosed tags
    .replace(/\s+/g, ' ')
    .trim();
}

function highlights(o: Obj): string[] {
  const h = o.highlights;
  if (!isObj(h)) return [];
  const out: string[] = [];
  for (const value of Object.values(h)) {
    if (Array.isArray(value)) {
      for (const s of value) if (typeof s === 'string') out.push(cleanHighlight(s));
    }
  }
  return out.filter((s) => s !== '').slice(0, MAX_HIGHLIGHTS);
}

function numbers(o: Obj): string[] {
  const listed = strList(o, 'numbers');
  const all = listed.length > 0 ? listed : [optStr(o, 'number')].filter((n) => n !== null);
  return [...new Set(all)];
}

/** One `/search` result. Exported for the shape tests. */
export function mapHit(raw: unknown): JudilibreHit {
  const o = asObj(raw, 'result');
  const jurisdictionKey = str(o, 'jurisdiction');
  const isCc = jurisdictionKey === 'cc';
  const chamberKey = optStr(o, 'chamber');
  const formationKey = optStr(o, 'formation');
  const solutionKey = optStr(o, 'solution');
  const solutionAlt = optStr(o, 'solution_alt');
  const locationKey = optStr(o, 'location');
  const date = optStr(o, 'decision_date');

  let solution: JudilibreHit['solution'] = null;
  let solutionText: string | null = solutionAlt === '' ? null : solutionAlt;
  if (solutionKey !== null && solutionKey !== '') {
    const known = Object.hasOwn(SOLUTION_LABELS, solutionKey);
    if (isCc || known) {
      // `other` with a free-text outcome carries no label of its own.
      if (!(solutionKey === 'other' && solutionText !== null)) {
        solution = labelled(SOLUTION_LABELS, solutionKey);
      }
    } else {
      solutionText = solutionText ?? solutionKey;
    }
  }

  return {
    id: str(o, 'id'),
    jurisdiction: labelled(JURISDICTION_LABELS, jurisdictionKey),
    chamber:
      chamberKey === null || chamberKey === ''
        ? null
        : isCc
          ? labelled(CHAMBER_LABELS, chamberKey)
          : { key: chamberKey, label: chamberKey },
    numbers: numbers(o),
    ecli: optStr(o, 'ecli') || null,
    formation:
      formationKey === null || formationKey === ''
        ? null
        : labelled(FORMATION_LABELS, formationKey),
    publication: strList(o, 'publication').map((k) => labelled(PUBLICATION_LABELS, k)),
    decisionDate: date !== null && isIsoDate(date) ? (date as IsoDate) : null,
    solution,
    solutionText,
    location:
      locationKey === null || locationKey === '' ? null : labelled(CA_LOCATION_LABELS, locationKey),
    summary: optStr(o, 'summary') || null,
    highlights: highlights(o),
  };
}

function int(o: Obj, key: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isInteger(v)) throw shape(`missing ${key}`);
  return v;
}

export function mapSearch(raw: unknown): JudilibreSearchPage {
  const o = asObj(raw, 'body');
  return {
    total: int(o, 'total'),
    page: int(o, 'page'),
    pageSize: int(o, 'page_size'),
    relaxed: o.relaxed === true,
    hits: list(o, 'results', true).map(mapHit),
  };
}

const ZONES: readonly DecisionZone[] = [
  'introduction',
  'expose',
  'moyens',
  'motivations',
  'dispositif',
  'annexes',
];

function zones(o: Obj): ZoneSegment[] {
  const z = o.zones;
  if (!isObj(z)) return [];
  const out: ZoneSegment[] = [];
  for (const zone of ZONES) {
    const segments = z[zone];
    if (!Array.isArray(segments)) continue;
    for (const seg of segments) {
      if (isObj(seg) && typeof seg.start === 'number' && typeof seg.end === 'number') {
        out.push({ zone, start: seg.start, end: seg.end });
      }
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

function isoOrNull(s: string | null): IsoDate | null {
  return s !== null && isIsoDate(s) ? (s as IsoDate) : null;
}

const HEX_ID = /^[0-9a-f]{24}$/;

function contested(o: Obj): JudilibreDecision['contested'] {
  const c = o.contested;
  if (!isObj(c)) return null;
  const id = [optStr(c, 'id'), optStr(c, 'url')].find((v) => v !== null && HEX_ID.test(v));
  return {
    title: (optStr(c, 'title') ?? '').replace(/\n/g, ', '),
    number: optStr(c, 'number') || null,
    date: isoOrNull(optStr(c, 'date')),
    judilibreId: id ?? null,
  };
}

/**
 * The outcome in this decision's own timeline entry: the entry with its id, else the one entry
 * dated on its decision date. The timeline is the whole case, so it may list later decisions.
 */
function solutionFull(o: Obj): string | null {
  const entries = Array.isArray(o.timeline) ? o.timeline.filter(isObj) : [];
  const id = optStr(o, 'id');
  const date = optStr(o, 'decision_date');
  const byId = entries.find((e) => id !== null && optStr(e, 'id') === id);
  const onDate = entries.filter((e) => date !== null && optStr(e, 'date') === date);
  const own = byId ?? (onDate.length === 1 ? onDate[0] : undefined);
  return own === undefined ? null : optStr(own, 'solution') || null;
}

function titles(o: Obj): string[] {
  return list(o, 'titlesAndSummaries').flatMap((t) => strList(t, 'titles'));
}

function files(o: Obj): JudilibreDecision['files'] {
  return list(o, 'files').map((f) => ({
    name: optStr(f, 'name') ?? '',
    type: optStr(f, 'type') ?? '',
    url: optStr(f, 'rawUrl') ?? str(f, 'url'),
  }));
}

/** `/decision`: the hit's shared fields plus the text, its zones and the decision's links. */
export function mapDecision(raw: unknown): JudilibreDecision {
  const o = asObj(raw, 'decision');
  const { highlights: _dropped, ...shared } = mapHit(o);
  return {
    ...shared,
    text: str(o, 'text'),
    zones: zones(o),
    solutionFull: solutionFull(o),
    updatedOn: isoOrNull(optStr(o, 'update_date')),
    titles: titles(o),
    visa: list(o, 'visa').map((v) => htmlToText(str(v, 'title'))),
    rapprochements: list(o, 'rapprochements').map((r) => str(r, 'title')),
    contested: contested(o),
    files: files(o),
  };
}

/** `/taxonomy`: a key-to-label map, a flat list, or (ca themes) lists headed by their group. */
export function mapTaxonomy(raw: unknown): TaxonomyEntry[] {
  const o = asObj(raw, 'body');
  const result = o.result;
  if (Array.isArray(result)) {
    if (result.every((x) => typeof x === 'string')) {
      return (result as string[]).map((label) => ({ key: null, label, group: null }));
    }
    return result.flatMap((g) => {
      if (!Array.isArray(g) || !g.every((x) => typeof x === 'string')) {
        throw shape('taxonomy result is not a list of strings or groups');
      }
      const [group, ...rest] = g as string[];
      return rest.map((label) => ({ key: null, label, group: group ?? null }));
    });
  }
  if (isObj(result)) {
    return Object.entries(result).map(([key, label]) => {
      if (typeof label !== 'string') throw shape(`taxonomy label of ${key} is not a string`);
      return { key, label, group: null };
    });
  }
  throw shape('missing taxonomy result');
}
