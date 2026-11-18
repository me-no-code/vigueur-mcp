import type { IsoDate } from '../../domain/dates.js';
import {
  CASS_CHAMBER_LABELS,
  type CaseLawCollection,
  type CassChamber,
} from '../../domain/decisions.js';
import { isDecisionId } from '../../domain/links.js';
import type {
  CallContext,
  CaseLawHit,
  CaseLawQuery,
  CaseLawRepository,
  CaseLawSearchPage,
  LegifranceDecision,
} from '../../services/case-law/ports.js';
import { VigueurError } from '../../shared/errors.js';
import { decodeEntities } from '../html.js';
import type { PisteHttp } from '../piste/http.js';
import { parseCaseLawTitle } from './case-law-titles.js';
import {
  asObj,
  isUnknownId,
  list,
  lookup,
  type Obj,
  optStr,
  postJson,
  shape,
  str,
} from './request.js';
import { champ } from './search.js';
import { htmlToText, parseApiDate, stripMarks } from './wire.js';

const MAX_PAGE_SIZE = 100;
const MAX_SNIPPET = 300;
const OPEN_START: IsoDate = '1800-01-01';
const OPEN_END: IsoDate = '2999-01-01';

// ---------------------------------------------------------------------------------------------
// Request

interface Fond {
  fond: string;
  numberField: string;
  hasEcli: boolean;
  dateFacet: string;
  sorts: Readonly<Record<'newest', string>>;
}

const DATED: Fond['sorts'] = { newest: 'DATE_DESC' };

/** The fond, its number field, its date facet and its sort names. */
const FONDS: Readonly<Record<CaseLawCollection, Fond>> = {
  judicial: {
    fond: 'JURI',
    numberField: 'NUM_AFFAIRE',
    hasEcli: true,
    dateFacet: 'DATE_DECISION',
    sorts: DATED,
  },
  administrative: {
    fond: 'CETAT',
    numberField: 'NUM_DEC',
    hasEcli: true,
    dateFacet: 'DATE_DECISION',
    sorts: DATED,
  },
  constitutional: {
    fond: 'CONSTIT',
    numberField: 'NUM_DEC',
    hasEcli: false,
    dateFacet: 'DATE_DECISION',
    sorts: DATED,
  },
  cnil: {
    fond: 'CNIL',
    numberField: 'NUM_DELIB',
    hasEcli: false,
    dateFacet: 'DATE_DELIB',
    sorts: { newest: 'DATE_DECISION_DESC' },
  },
  financial: {
    fond: 'JUFI',
    numberField: 'NUM_DEC',
    hasEcli: false,
    dateFacet: 'DATE_DECISION',
    sorts: DATED,
  },
};

const COURTS = {
  cassation: 'Cour de cassation',
  appeal: "Juridictions d'appel",
  first_instance: 'Juridictions du premier degré',
} as const;

/** The shared chamber vocabulary on the Légifrance wire. */
const CHAMBERS: Readonly<Record<CassChamber, string>> = {
  plenary: 'ASSEMBLEE_PLENIERE',
  mixed: 'CHAMBRE_MIXTE',
  civ1: 'CHAMBRE_CIVILE_1',
  civ2: 'CHAMBRE_CIVILE_2',
  civ3: 'CHAMBRE_CIVILE_3',
  commercial: 'CHAMBRE_COMMERCIALE',
  social: 'CHAMBRE_SOCIALE',
  criminal: 'CHAMBRE_CRIMINELLE',
};

type Filter =
  | { facette: string; valeurs: string[] }
  | { facette: string; dates: { start: IsoDate; end: IsoDate } };

const invalid = (message: string) => new VigueurError('invalid_input', message);
const given = (v: string | undefined): v is string => v !== undefined && v.trim() !== '';

function validate(q: CaseLawQuery): void {
  if (!Number.isInteger(q.pageSize) || q.pageSize < 1 || q.pageSize > MAX_PAGE_SIZE) {
    throw invalid(`"page_size" must be a whole number from 1 to ${MAX_PAGE_SIZE}.`);
  }
  if (!Number.isInteger(q.page) || q.page < 1) {
    throw invalid('"page" must be a whole number from 1.');
  }
  const judicial = q.collection === 'judicial';
  if (q.court !== undefined && !judicial) {
    throw invalid(`"court" does not apply to the ${q.collection} collection.`);
  }
  if (q.chamber !== undefined && !judicial) {
    throw invalid(`"chamber" does not apply to the ${q.collection} collection.`);
  }
  if (given(q.ecli) && !FONDS[q.collection].hasEcli) {
    throw invalid(`"ecli" does not apply to the ${q.collection} collection.`);
  }
  if (
    q.publication !== undefined &&
    (q.collection === 'constitutional' || q.collection === 'cnil')
  ) {
    throw invalid(`"publication" does not apply to the ${q.collection} collection.`);
  }
}

function buildChamps(q: CaseLawQuery, fond: Fond) {
  const champs = [];
  if (given(q.text)) champs.push(champ('ALL', 'TOUS_LES_MOTS_DANS_UN_CHAMP', q.text));
  if (given(q.number)) champs.push(champ(fond.numberField, 'EXACTE', q.number));
  if (given(q.ecli)) champs.push(champ('ECLI', 'EXACTE', q.ecli));
  // `*` matches every decision: the answer is then carried by the filters and the sort.
  return champs.length > 0 ? champs : [champ('ALL', 'UN_DES_MOTS', '*')];
}

function publicationFilter(q: CaseLawQuery): Filter | null {
  if (q.publication === undefined) return null;
  const published = q.publication === 'published';
  if (q.collection === 'judicial') {
    return { facette: 'CASSATION_TYPE_PUBLICATION_BULLETIN', valeurs: [published ? 'T' : 'F'] };
  }
  return { facette: 'PUBLICATION_RECUEIL', valeurs: [published ? 'PUBLIE' : 'NON_PUBLIE'] };
}

function buildFilters(q: CaseLawQuery, fond: Fond): Filter[] {
  const filters: Filter[] = [];
  if (q.court !== undefined) {
    filters.push({ facette: 'JURIDICTION_JUDICIAIRE', valeurs: [COURTS[q.court]] });
  }
  if (q.chamber !== undefined) {
    filters.push({ facette: 'CASSATION_FORMATION', valeurs: [CHAMBERS[q.chamber]] });
  }
  const publication = publicationFilter(q);
  if (publication !== null) filters.push(publication);
  if (q.dateFrom !== undefined || q.dateTo !== undefined) {
    filters.push({
      facette: fond.dateFacet,
      dates: { start: q.dateFrom ?? OPEN_START, end: q.dateTo ?? OPEN_END },
    });
  }
  return filters;
}

function buildBody(q: CaseLawQuery) {
  const fond = FONDS[q.collection];
  const filtres = buildFilters(q, fond);
  return {
    fond: fond.fond,
    recherche: {
      champs: buildChamps(q, fond),
      ...(filtres.length > 0 ? { filtres } : {}),
      pageNumber: q.page,
      pageSize: q.pageSize,
      operateur: 'ET',
      sort: q.sort === 'relevance' ? 'PERTINENCE' : fond.sorts[q.sort],
      typePagination: 'DEFAUT',
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Response

const oneLine = (s: string) => stripMarks(s).replace(/\s+/g, ' ').trim();

function snippetOf(result: Obj): string | null {
  const text = optStr(result, 'text');
  const clean = text === null ? '' : oneLine(text);
  if (clean === '') return null;
  return clean.length <= MAX_SNIPPET ? clean : `${clean.slice(0, MAX_SNIPPET - 1).trimEnd()}…`;
}

function mapHit(result: Obj, collection: CaseLawCollection): CaseLawHit {
  const title = list(result, 'titles')[0];
  if (title === undefined) throw shape('search result without a title');
  const id = str(title, 'id');
  if (!isDecisionId(id)) throw shape(`search result with an id that is not a decision id`);
  const text = oneLine(str(title, 'title'));
  const parsed = parseCaseLawTitle(collection, text);
  return {
    id,
    collection,
    title: text,
    court: parsed?.court ?? null,
    chamber: parsed?.chamber ?? null,
    // A CNIL title opens with the kind of act ("Délibération", "Décision"); the hit's own `nature`
    // is a lower-case key of the source. The tools print the act kind, so the title wins there.
    nature:
      collection === 'cnil'
        ? (parsed?.nature ?? optStr(result, 'nature') ?? null)
        : (optStr(result, 'nature') ?? parsed?.nature ?? null),
    decisionDate: parsed?.date ?? parseApiDate(result.date).date,
    numbers: parsed?.numbers ?? [],
    publication: parsed?.publication ?? null,
    // The outcome comes from the hit only: a title's trailing words (e.g. a QPC's) are not parsed.
    solution: optStr(result, 'solution'),
    snippet: snippetOf(result),
  };
}

function mapSearch(body: unknown, q: CaseLawQuery): CaseLawSearchPage {
  const o = asObj(body, 'body');
  const total = o.totalResultNumber;
  if (typeof total !== 'number' || !Number.isFinite(total))
    throw shape('missing totalResultNumber');
  return {
    total,
    page: q.page,
    pageSize: q.pageSize,
    hits: list(o, 'results', true).map((r) => mapHit(r, q.collection)),
  };
}

export function searchCaseLaw(
  http: PisteHttp,
  query: CaseLawQuery,
  ctx?: CallContext,
): Promise<CaseLawSearchPage> {
  try {
    validate(query);
  } catch (err) {
    return Promise.reject(err);
  }
  return postJson(http, '/search', buildBody(query), ctx, (raw) => mapSearch(raw, query));
}

// ---------------------------------------------------------------------------------------------
// Read a decision

const ID_PREFIXES: Readonly<Record<string, CaseLawCollection>> = {
  JURITEXT: 'judicial',
  CETATEXT: 'administrative',
  CONSTEXT: 'constitutional',
  CNILTEXT: 'cnil',
  JUFITEXT: 'financial',
};

/** JURI `formation` keys (Légifrance wire) to their French label. */
const CHAMBER_LABELS: Readonly<Record<string, string>> = Object.fromEntries(
  (Object.keys(CHAMBERS) as CassChamber[]).map((k) => [CHAMBERS[k], CASS_CHAMBER_LABELS[k]]),
);

const PUBLICATION_BULLETIN: Readonly<Record<string, string>> = {
  T: 'Publié au bulletin',
  F: 'Inédit',
};

/** A non-empty string, else null (the source sends `""` for "nothing"). */
const filled = (o: Obj, key: string) => optStr(o, key)?.trim() || null;

function collectionOf(id: string): CaseLawCollection {
  const collection = Object.hasOwn(ID_PREFIXES, id.slice(0, 8))
    ? ID_PREFIXES[id.slice(0, 8)]
    : undefined;
  if (collection === undefined) {
    throw invalid(
      `"${id}" is not a Légifrance case-law id (JURITEXT, CETATEXT, CONSTEXT, CNILTEXT or JUFITEXT).`,
    );
  }
  return collection;
}

function numbersOf(o: Obj): string[] {
  const v = o.numeroAffaire;
  const fromAffaire = Array.isArray(v)
    ? v.filter((n): n is string => typeof n === 'string' && n.trim() !== '').map((n) => n.trim())
    : [];
  if (fromAffaire.length > 0) return fromAffaire;
  const num = filled(o, 'num');
  return num === null ? [] : [num];
}

function summaryOf(o: Obj): string | null {
  const lines = list(o, 'sommaire').flatMap((entry) =>
    [optStr(entry, 'resumePrincipal'), optStr(entry, 'abstrats')]
      .map((html) => (html === null ? '' : htmlToText(html)))
      .filter((t) => t !== ''),
  );
  return lines.length > 0 ? lines.join('\n') : null;
}

function attackedOf(o: Obj): LegifranceDecision['attacked'] {
  const a = o.decisionAttaquee;
  if (a === null || a === undefined) return null;
  const obj = asObj(a, 'decisionAttaquee');
  const court = filled(obj, 'formation');
  return court === null ? null : { court, date: parseApiDate(obj.date).date };
}

function mapDecision(raw: unknown, id: string, collection: CaseLawCollection): LegifranceDecision {
  const o = asObj(asObj(raw, 'body').text, 'text');
  const title = oneLine(filled(o, 'titreLong') ?? str(o, 'titre'));
  const parsed = parseCaseLawTitle(collection, oneLine(filled(o, 'titre') ?? title));
  const formation = filled(o, 'formation');
  const bulletin = collection === 'judicial' ? filled(o, 'typePublicationBulletin') : null;
  const html = optStr(o, 'texteHtml');
  const plain = optStr(o, 'texte');
  return {
    id,
    collection,
    title,
    court: filled(o, 'juridiction') ?? parsed?.court ?? null,
    chamber:
      collection === 'judicial' && formation !== null
        ? lookup(CHAMBER_LABELS, formation, formation)
        : (formation ?? parsed?.chamber ?? null),
    nature: filled(o, 'nature') ?? parsed?.nature ?? null,
    decisionDate: parseApiDate(o.dateTexte).date ?? parsed?.date ?? null,
    numbers: numbersOf(o),
    ecli: filled(o, 'ecli'),
    solution: filled(o, 'solution'),
    publication:
      bulletin !== null && Object.hasOwn(PUBLICATION_BULLETIN, bulletin)
        ? (PUBLICATION_BULLETIN[bulletin] as string)
        : (parsed?.publication ?? null),
    summary: summaryOf(o),
    attacked: attackedOf(o),
    text:
      html !== null && html.trim() !== ''
        ? htmlToText(html)
        : plain === null
          ? ''
          : decodeEntities(plain).trim(),
    constitutionalCouncilUrl: filled(o, 'urlCC'),
    joUrl: filled(o, 'lienJo'),
    labelledStatus: filled(o, 'etat'),
    publishedOn: parseApiDate(o.datePubli).date,
  };
}

export async function getDecision(
  http: PisteHttp,
  id: string,
  ctx?: CallContext,
): Promise<LegifranceDecision | null> {
  const collection = collectionOf(id);
  const path = collection === 'cnil' ? '/consult/cnil' : '/consult/juri';
  try {
    return await postJson(http, path, { textId: id }, ctx, (raw) =>
      mapDecision(raw, id, collection),
    );
  } catch (err) {
    if (isUnknownId(err)) return null;
    throw err;
  }
}

export function createLegifranceCaseLawClient(http: PisteHttp): CaseLawRepository {
  return {
    searchCaseLaw: (q, ctx) => searchCaseLaw(http, q, ctx),
    getDecision: (id, ctx) => getDecision(http, id, ctx),
  };
}
