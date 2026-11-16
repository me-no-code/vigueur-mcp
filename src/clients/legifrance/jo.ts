import type { IsoDate } from '../../domain/dates.js';
import type {
  CallContext,
  FacetValue,
  JoGroup,
  JoIssue,
  JoText,
} from '../../services/legislation/ports.js';
import { VigueurError } from '../../shared/errors.js';
import type { PisteHttp } from '../piste/http.js';
import { asObj, isObj, list, type Obj, optStr, postJson, shape, str } from './request.js';
import { buildJorfFilterOnlyBody } from './search.js';
import { cleanTitle, parseApiDate, stripIdSuffix } from './wire.js';

// Journal officiel: /consult/lastNJo and /consult/jorfCont (issues, newest first, dates are
// publication dates) and the facets of a filter-only JORF search.

const MIN_ISSUES = 1;
const MAX_ISSUES = 10;
const CONT_PAGE_SIZE = 10;
/** Safety stop for a date range: more pages than this is not a plausible answer. */
const MAX_CONT_PAGES = 50;

/** Empty strings are as good as absent on the wire. */
const orNull = (o: Obj, key: string): string | null => {
  const v = optStr(o, key);
  return v === null || v.trim() === '' ? null : v;
};

const order = (o: Obj): number => (typeof o.ordre === 'number' ? o.ordre : 0);
const byOrder = (a: Obj, b: Obj) => order(a) - order(b);

function mapText(t: Obj): JoText {
  return {
    id: stripIdSuffix(str(t, 'id')),
    title: cleanTitle(optStr(t, 'titre') ?? ''),
    nature: orNull(t, 'nature'),
    ministry: orNull(t, 'ministere'),
    emitter: orNull(t, 'emetteur'),
  };
}

/** Items without an id carry nothing to link to: they are skipped, not fatal for the whole issue. */
function mapTexts(items: Obj[]): JoText[] {
  return [...items]
    .sort(byOrder)
    .filter((t) => typeof t.id === 'string' && t.id !== '')
    .map(mapText);
}

function flatten(node: Obj, parents: string[], out: JoGroup[]): void {
  const path = [...parents, cleanTitle(optStr(node, 'titre') ?? '')];
  const texts = mapTexts(list(node, 'liensTxt'));
  if (texts.length > 0) out.push({ path, texts });
  for (const child of [...list(node, 'tms')].sort(byOrder)) flatten(child, path, out);
}

function mapGroups(structure: unknown): JoGroup[] | null {
  if (structure === undefined || structure === null) return null;
  const o = asObj(structure, 'structure');
  const groups: JoGroup[] = [];
  const loose = mapTexts(list(o, 'liens'));
  if (loose.length > 0) groups.push({ path: [], texts: loose });
  for (const tm of [...list(o, 'tms')].sort(byOrder)) flatten(tm, [], groups);
  return groups;
}

/** An ELI path, so that the issue's link stays on legifrance.gouv.fr. */
const ELI_PATH = /^\/eli\/[\w/.-]+$/;

function mapIssue(c: Obj): JoIssue {
  const eliPath = orNull(c, 'idEli');
  return {
    id: stripIdSuffix(str(c, 'id')),
    title: cleanTitle(str(c, 'titre')),
    number: orNull(c, 'num'),
    publishedOn: parseApiDate(c.datePubli).date,
    eliPath: eliPath !== null && ELI_PATH.test(eliPath) ? eliPath : null,
    groups: mapGroups(c.structure),
  };
}

const mapLatest = (raw: unknown): JoIssue[] =>
  list(asObj(raw, 'body'), 'containers', true).map(mapIssue);

/** `/consult/jorfCont` answers `{ items: [{ joCont }], totalNbResult }`. */
function mapCont(raw: unknown): { issues: JoIssue[]; total: number } {
  const o = asObj(raw, 'body');
  const issues = list(o, 'items', true).map((item) => {
    if (!isObj(item.joCont)) throw shape('item without joCont');
    return mapIssue(item.joCont);
  });
  const total = typeof o.totalNbResult === 'number' ? o.totalNbResult : issues.length;
  return { issues, total };
}

export function getLatestJo(
  http: PisteHttp,
  count: number,
  ctx: CallContext | undefined,
): Promise<JoIssue[]> {
  if (!Number.isInteger(count) || count < MIN_ISSUES || count > MAX_ISSUES) {
    return Promise.reject(
      new VigueurError(
        'invalid_input',
        `"count" must be a whole number from ${MIN_ISSUES} to ${MAX_ISSUES}.`,
      ),
    );
  }
  return postJson(http, '/consult/lastNJo', { nbElement: count }, ctx, mapLatest);
}

const day = (d: IsoDate) => ({
  dayOfMonth: Number(d.slice(8, 10)),
  month: Number(d.slice(5, 7)),
  year: Number(d.slice(0, 4)),
});

export async function getJoIssuesBetween(
  http: PisteHttp,
  from: IsoDate,
  to: IsoDate,
  ctx: CallContext | undefined,
): Promise<JoIssue[]> {
  const issues: JoIssue[] = [];
  for (let page = 1; page <= MAX_CONT_PAGES; page++) {
    const body = { start: day(from), end: day(to), pageNumber: page, pageSize: CONT_PAGE_SIZE };
    const got = await postJson(http, '/consult/jorfCont', body, ctx, mapCont);
    issues.push(...got.issues.map((i) => ({ ...i, groups: null })));
    if (got.issues.length === 0 || issues.length >= got.total) return issues;
  }
  throw new VigueurError(
    'invalid_input',
    `There are more than ${MAX_CONT_PAGES * CONT_PAGE_SIZE} Journal officiel issues between ${from} and ${to}: narrow the date range.`,
  );
}

export async function getJoIssue(
  http: PisteHttp,
  id: string,
  ctx: CallContext | undefined,
): Promise<JoIssue | null> {
  const body = { id, pageNumber: 1, pageSize: CONT_PAGE_SIZE };
  const { issues } = await postJson(http, '/consult/jorfCont', body, ctx, mapCont);
  return issues[0] ?? null;
}

// ---------------------------------------------------------------------------------------------
// Facets

function facetValues(facets: Obj[], name: string): FacetValue[] {
  const facet = facets.find((f) => f.facetElem === name);
  if (facet === undefined) return [];
  const values = asObj(facet.values, `${name} values`);
  return Object.entries(values)
    .filter((e): e is [string, number] => typeof e[1] === 'number' && e[1] > 0)
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || (a.value < b.value ? -1 : a.value > b.value ? 1 : 0));
}

export function getJorfFacets(
  http: PisteHttp,
  from: IsoDate,
  to: IsoDate,
  ctx: CallContext | undefined,
): Promise<{ natures: FacetValue[]; emitters: FacetValue[] }> {
  return postJson(http, '/search', buildJorfFilterOnlyBody(from, to, 1), ctx, (raw) => {
    const facets = list(asObj(raw, 'body'), 'facets', true);
    return { natures: facetValues(facets, 'NATURE'), emitters: facetValues(facets, 'EMETTEUR') };
  });
}
