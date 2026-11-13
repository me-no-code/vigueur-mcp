import type { IsoDate } from '../../domain/dates.js';
import type {
  CallContext,
  LegislationCollection,
  LegislationHit,
  LegislationQuery,
  LegislationSearchPage,
} from '../../services/legislation/ports.js';
import { VigueurError } from '../../shared/errors.js';
import type { PisteHttp } from '../piste/http.js';
import {
  asObj,
  cleanNum,
  list,
  numKey,
  type Obj,
  optStr,
  postJson,
  shape,
  str,
} from './request.js';
import { mapPisteStatus } from './status-map.js';
import { cleanTitle, parseApiDate, stripIdSuffix, stripMarks } from './wire.js';

const MAX_PAGE_SIZE = 100;
const TEXT_ID = /^(?:LEGITEXT|JORFTEXT|KALITEXT)/;

// ---------------------------------------------------------------------------------------------
// Request

type Criterion = 'text' | 'articleNumber' | 'textNumber' | 'nor' | 'idcc';
type Filter =
  | { facette: string; valeurs: string[] }
  | { facette: string; singleDate: IsoDate }
  | { facette: string; dates: { start: IsoDate; end: IsoDate } };

/** Which criteria and refinements each collection understands. */
const SUPPORTED: Readonly<Record<LegislationCollection, readonly (keyof LegislationQuery)[]>> = {
  codes: ['text', 'articleNumber', 'codeTitle'],
  loda: ['text', 'articleNumber', 'textNumber', 'nor', 'nature'],
  jorf: ['text', 'articleNumber', 'textNumber', 'nor', 'nature', 'publishedFrom', 'publishedTo'],
  kali: ['text', 'idcc'],
};
const CRITERIA: readonly Criterion[] = ['text', 'articleNumber', 'textNumber', 'nor', 'idcc'];
const REFINEMENTS = ['codeTitle', 'nature', 'publishedFrom', 'publishedTo'] as const;

/** The `legifrance_search_legislation` parameter of each query field: messages reach the caller. */
const PARAM: Readonly<Record<Criterion | (typeof REFINEMENTS)[number], string>> = {
  text: 'query',
  articleNumber: 'article_number',
  textNumber: 'text_number',
  nor: 'nor',
  idcc: 'idcc',
  codeTitle: 'code',
  nature: 'nature',
  publishedFrom: 'published_from',
  publishedTo: 'published_to',
};

const invalid = (message: string) => new VigueurError('invalid_input', message);

const given = (v: string | undefined): v is string => v !== undefined && v.trim() !== '';

function validate(q: LegislationQuery): void {
  if (!Number.isInteger(q.pageSize) || q.pageSize < 1 || q.pageSize > MAX_PAGE_SIZE) {
    throw invalid(`"page_size" must be a whole number from 1 to ${MAX_PAGE_SIZE}.`);
  }
  if (!Number.isInteger(q.page) || q.page < 1) {
    throw invalid('"page" must be a whole number from 1.');
  }
  if (!CRITERIA.some((c) => given(q[c]))) {
    throw invalid(
      'Give at least one of "query", "article_number", "text_number", "nor" or "idcc": "code", "nature" and the publication dates only narrow a search.',
    );
  }
  for (const key of [...CRITERIA, ...REFINEMENTS]) {
    if (q[key] !== undefined && !SUPPORTED[q.collection].includes(key)) {
      throw invalid(`"${PARAM[key]}" does not apply to the ${q.collection} collection.`);
    }
  }
}

function champ(typeChamp: string, typeRecherche: string, valeur: string) {
  return {
    typeChamp,
    criteres: [{ typeRecherche, valeur: valeur.trim(), operateur: 'ET' }],
    operateur: 'ET',
  };
}

function buildChamps(q: LegislationQuery) {
  const champs = [];
  if (given(q.text)) champs.push(champ('ALL', 'TOUS_LES_MOTS_DANS_UN_CHAMP', q.text));
  if (given(q.articleNumber)) champs.push(champ('NUM_ARTICLE', 'EXACTE', q.articleNumber));
  if (given(q.textNumber)) champs.push(champ('NUM', 'EXACTE', q.textNumber));
  if (given(q.nor)) champs.push(champ('NOR', 'EXACTE', q.nor));
  if (given(q.idcc)) champs.push(champ('IDCC', 'EXACTE', q.idcc));
  return champs;
}

const publicationDates = (start: IsoDate, end: IsoDate): Filter => ({
  facette: 'DATE_PUBLICATION',
  dates: { start, end },
});

/**
 * The one JORF body without a text criterion: `*` on champ ALL matches everything, so the
 * answer is carried by the filters and the facets.
 */
export function buildJorfFilterOnlyBody(start: IsoDate, end: IsoDate, pageSize: number) {
  return {
    fond: 'JORF',
    recherche: {
      champs: [champ('ALL', 'UN_DES_MOTS', '*')],
      filtres: [publicationDates(start, end)],
      pageNumber: 1,
      pageSize,
      operateur: 'ET',
      sort: 'PUBLICATION_DATE_DESC',
      typePagination: 'DEFAUT',
    },
  };
}

function buildFond(q: LegislationQuery): { fond: string; filtres: Filter[] } {
  const filtres: Filter[] = [];
  const historical = q.includeHistorical;
  switch (q.collection) {
    case 'codes':
      if (given(q.codeTitle)) {
        filtres.push({
          facette: historical ? 'TEXT_NOM_CODE' : 'NOM_CODE',
          valeurs: [q.codeTitle.trim()],
        });
      }
      if (!historical) filtres.push({ facette: 'DATE_VERSION', singleDate: q.atDate });
      return { fond: historical ? 'CODE_ETAT' : 'CODE_DATE', filtres };
    case 'loda':
      if (!historical) filtres.push({ facette: 'DATE_VERSION', singleDate: q.atDate });
      if (given(q.nature)) {
        filtres.push({
          facette: historical ? 'TEXT_NATURE' : 'NATURE',
          valeurs: [q.nature.trim()],
        });
      }
      return { fond: historical ? 'LODA_ETAT' : 'LODA_DATE', filtres };
    case 'jorf':
      if (given(q.nature)) filtres.push({ facette: 'NATURE', valeurs: [q.nature.trim()] });
      if (q.publishedFrom !== undefined || q.publishedTo !== undefined) {
        filtres.push(publicationDates(q.publishedFrom ?? '1800-01-01', q.publishedTo ?? q.atDate));
      }
      return { fond: 'JORF', filtres };
    case 'kali':
      // KALI has no date filter: "in force" means currently in force, extended or not.
      if (!historical) {
        filtres.push({
          facette: 'LEGAL_STATUS',
          valeurs: ['VIGUEUR', 'VIGUEUR_ETEN', 'VIGUEUR_NON_ETEN'],
        });
      }
      return { fond: 'KALI', filtres };
  }
}

function buildBody(q: LegislationQuery) {
  const { fond, filtres } = buildFond(q);
  const articleLevel = q.collection === 'codes' || given(q.articleNumber);
  return {
    fond,
    recherche: {
      champs: buildChamps(q),
      filtres,
      pageNumber: q.page,
      pageSize: q.pageSize,
      operateur: 'ET',
      sort: q.collection === 'jorf' ? 'PUBLICATION_DATE_DESC' : 'PERTINENCE',
      typePagination: articleLevel ? 'ARTICLE' : 'DEFAUT',
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Response

const clean = (s: string) => cleanTitle(stripMarks(s));

/** The text a result belongs to: the title entry carrying a LEGITEXT / JORFTEXT / KALITEXT id. */
function textOf(result: Obj): {
  id: string;
  cid: string | null;
  title: string;
  validFrom: IsoDate | null;
  validTo: IsoDate | null;
} {
  for (const t of list(result, 'titles')) {
    const id = optStr(t, 'id');
    if (id !== null && TEXT_ID.test(id)) {
      return {
        id: stripIdSuffix(id),
        cid: optStr(t, 'cid'),
        title: clean(str(t, 'title')),
        validFrom: parseApiDate(t.startDate).date,
        validTo: parseApiDate(t.endDate).date,
      };
    }
  }
  throw shape('search result without a text title');
}

function mapResult(result: Obj, q: LegislationQuery): LegislationHit[] {
  const text = textOf(result);
  const nature = optStr(result, 'nature');
  const publishedOn = parseApiDate(result.datePublication).date;
  const nor = optStr(result, 'nor');
  const wanted = given(q.articleNumber) ? numKey(q.articleNumber) : null;
  const common = {
    textId: text.id,
    textCid: text.cid,
    title: text.title,
    nature,
    publishedOn,
    nor,
  };

  const hits: LegislationHit[] = [];
  let sawArticle = false;
  for (const section of list(result, 'sections')) {
    for (const extract of list(section, 'extracts')) {
      const id = optStr(extract, 'id');
      if (id === null || id === '') continue; // a field match (NOR, IDCC), not an article
      sawArticle = true;
      const num = cleanNum(optStr(extract, 'num') ?? '');
      if (wanted !== null && numKey(num) !== wanted) continue;
      const rawStatus = optStr(extract, 'legalStatus') ?? '';
      const first = Array.isArray(extract.values) ? extract.values[0] : undefined;
      hits.push({
        ...common,
        kind: 'article',
        id: stripIdSuffix(id),
        articleNumber: num === '' ? null : num,
        status: mapPisteStatus(rawStatus),
        rawStatus,
        validFrom: parseApiDate(extract.dateDebut).date,
        validTo: parseApiDate(extract.dateFin).date,
        snippet: typeof first === 'string' && clean(first) !== '' ? clean(first) : null,
      });
    }
  }
  if (sawArticle) return hits;

  const rawStatus = optStr(result, 'etat') ?? '';
  const snippet = optStr(result, 'text');
  return [
    {
      ...common,
      kind: 'text',
      id: text.id,
      articleNumber: null,
      status: mapPisteStatus(rawStatus),
      rawStatus,
      validFrom: text.validFrom,
      validTo: text.validTo,
      snippet: snippet !== null && clean(snippet) !== '' ? clean(snippet) : null,
    },
  ];
}

function count(o: Obj, key: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw shape(`missing ${key}`);
  return v;
}

function mapSearch(
  body: unknown,
  q: LegislationQuery,
  articleLevel: boolean,
): LegislationSearchPage {
  const o = asObj(body, 'body');
  return {
    total: count(o, articleLevel ? 'totalArticleResultNumber' : 'totalResultNumber'),
    page: q.page,
    pageSize: q.pageSize,
    hits: list(o, 'results', true).flatMap((r) => mapResult(r, q)),
  };
}

export function searchLegislation(
  http: PisteHttp,
  query: LegislationQuery,
  ctx?: CallContext,
): Promise<LegislationSearchPage> {
  try {
    validate(query);
  } catch (err) {
    return Promise.reject(err);
  }
  const body = buildBody(query);
  const articleLevel = body.recherche.typePagination === 'ARTICLE';
  return postJson(http, '/search', body, ctx, (raw) => mapSearch(raw, query, articleLevel));
}
