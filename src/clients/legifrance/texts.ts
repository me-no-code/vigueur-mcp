import type { IsoDate } from '../../domain/dates.js';
import type {
  CallContext,
  TextArticle,
  TextRecord,
  TextSection,
} from '../../services/legislation/ports.js';
import { VigueurError } from '../../shared/errors.js';
import type { PisteHttp } from '../piste/http.js';
import { asObj, list, type Obj, optStr, postJson, str } from './request.js';
import { mapPisteStatus } from './status-map.js';
import { cleanTitle, htmlToText, parseApiDate, stripIdSuffix } from './wire.js';

// Whole texts (laws, decrees, JORF): LODA /consult/lawDecree, JORF /consult/jorf and
// /consult/getJoWithNor. Sections come back unordered: they are sorted by `intOrdre`.

/** The one 400 that means "no such text" on a consult call. */
const UNKNOWN_ID_MESSAGE = "L'expression à valider est fausse";

const order = (o: Obj): number => (typeof o.intOrdre === 'number' ? o.intOrdre : 0);
const byOrder = (a: Obj, b: Obj) => order(a) - order(b);

/** HTML to text, `null` when nothing is left. */
function optText(o: Obj, key: string): string | null {
  const html = optStr(o, key);
  if (html === null) return null;
  const text = htmlToText(html);
  return text === '' ? null : text;
}

function mapArticle(a: Obj): TextArticle {
  const rawStatus = optStr(a, 'etat') ?? '';
  const from = parseApiDate(a.dateDebut);
  const to = parseApiDate(a.dateFin);
  return {
    id: stripIdSuffix(str(a, 'id')),
    num: optStr(a, 'num')?.trim() || null,
    status: mapPisteStatus(rawStatus),
    rawStatus,
    validFrom: from.date,
    validTo: to.date,
    validToUndetermined: to.sentinel === 'undetermined',
    text: optText(a, 'content') ?? '',
  };
}

function mapArticles(o: Obj): TextArticle[] {
  return [...list(o, 'articles')].sort(byOrder).map(mapArticle);
}

function mapSection(s: Obj): TextSection {
  const id = stripIdSuffix(str(s, 'id'));
  return {
    id,
    cid: optStr(s, 'cid') || id,
    title: cleanTitle(optStr(s, 'title') ?? ''),
    status: mapPisteStatus(optStr(s, 'etat')),
    validFrom: parseApiDate(s.dateDebut).date,
    validTo: parseApiDate(s.dateFin).date,
    sections: [...list(s, 'sections')].sort(byOrder).map(mapSection),
    articles: mapArticles(s),
  };
}

function mapText(raw: unknown): TextRecord {
  const o = asObj(raw, 'body');
  const id = stripIdSuffix(str(o, 'id'));
  const etat = optStr(o, 'etat');
  return {
    id,
    cid: optStr(o, 'cid') || id,
    title: cleanTitle(str(o, 'title')),
    nature: optStr(o, 'nature'),
    status: etat === null ? null : mapPisteStatus(etat),
    jurisState: optStr(o, 'jurisState'),
    nor: optStr(o, 'nor') || null,
    jorfLabel: optStr(o, 'jorfText') || null,
    publishedOn: parseApiDate(o.dateParution).date,
    signedOn: parseApiDate(o.dateTexte).date,
    validFrom: parseApiDate(o.dateDebutVersion).date,
    validTo: parseApiDate(o.dateFinVersion).date,
    visa: optText(o, 'visa'),
    nota: optText(o, 'nota'),
    sections: [...list(o, 'sections')].sort(byOrder).map(mapSection),
    articles: mapArticles(o),
  };
}

function isUnknownId(err: unknown): boolean {
  return (
    err instanceof VigueurError &&
    err.kind === 'invalid_input' &&
    err.message.includes('HTTP 400') &&
    err.message.includes(UNKNOWN_ID_MESSAGE)
  );
}

async function consult(
  http: PisteHttp,
  path: string,
  body: unknown,
  ctx: CallContext | undefined,
): Promise<TextRecord | null> {
  try {
    return await postJson(http, path, body, ctx, mapText);
  } catch (err) {
    if (isUnknownId(err)) return null;
    throw err;
  }
}

export function getText(
  http: PisteHttp,
  textId: string,
  asOf: IsoDate,
  ctx: CallContext | undefined,
) {
  return consult(http, '/consult/lawDecree', { textId, date: asOf }, ctx);
}

export function getJorfText(http: PisteHttp, textCid: string, ctx: CallContext | undefined) {
  return consult(http, '/consult/jorf', { textCid }, ctx);
}

export function getJorfTextByNor(http: PisteHttp, nor: string, ctx: CallContext | undefined) {
  return consult(http, '/consult/getJoWithNor', { nor }, ctx);
}
