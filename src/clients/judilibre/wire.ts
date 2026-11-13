import { type IsoDate, isIsoDate } from '../../domain/dates.js';
import type {
  JudilibreHit,
  JudilibreQuery,
  JudilibreSearchPage,
} from '../../services/case-law/ports.js';
import { asObj, isObj, list, type Obj, optStr, shape, str } from '../json.js';
import {
  CHAMBER_LABELS,
  CHAMBER_WIRE,
  FORMATION_LABELS,
  JURISDICTION_LABELS,
  labelled,
  PUBLICATION_LABELS,
  SOLUTION_LABELS,
} from './labels.js';

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
      locationKey === null || locationKey === '' ? null : { key: locationKey, label: locationKey },
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
