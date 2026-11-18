import type { IsoDate } from '../../domain/dates.js';
import { jorfUrl, lodaUrl } from '../../domain/links.js';
import { foldKey } from '../../domain/text.js';
import { type TextForce, textForceAt } from '../../domain/text-force.js';
import { VigueurError } from '../../shared/errors.js';
import { blankToNull, invalid, requireIsoDate, todayInParis } from '../input.js';
import type {
  CallContext,
  LegislationHit,
  LegislationRepository,
  TextArticle,
  TextRecord,
  TextSection,
} from './ports.js';
import { normaliseTextNumber, type TextNature } from './text-ref.js';

export type { TextNature } from './text-ref.js';

export interface GetTextInput {
  id?: string;
  nor?: string;
  nature?: TextNature;
  number?: string;
  atDate?: IsoDate;
  sectionCid?: string;
}

export interface TextView {
  record: TextRecord;
  asOf: IsoDate;
  url: string;
  focus: TextSection | null;
  flatArticles: Array<{ article: TextArticle; path: string[] }>;
  /** Caveats about how the text was resolved; empty unless the resolution needs one. */
  warnings: string[];
}

export interface NotInForceText {
  textId: string;
  textCid: string | null;
  title: string;
  nature: string | null;
  nor: string | null;
  publishedOn: IsoDate | null;
  /** `no_version`: Légifrance has the text but no version of it on `asOf` (read before it existed). */
  verdict: 'ended' | 'not_yet' | 'undetermined' | 'no_version';
  /** Ceased on (ended) or enters into force on (not_yet); null otherwise, never a sentinel. */
  on: IsoDate | null;
}

export type GetTextResult =
  | { kind: 'found'; text: TextView }
  /** `more`: the search has more results than its page returned, so candidates may be missing. */
  | { kind: 'ambiguous'; candidates: LegislationHit[]; more: boolean }
  /** Texts carry this number or id, but none is in force on `asOf` by its article dates: listed, never shown as law. */
  | {
      kind: 'not_in_force';
      input: string;
      asOf: IsoDate;
      candidates: NotInForceText[];
      more: boolean;
    }
  /** No text of the asked nature carries `number`, but texts of other natures do: listed, never read. */
  | {
      kind: 'other_nature';
      input: string;
      number: string;
      candidates: LegislationHit[];
      more: boolean;
    }
  | { kind: 'not_found'; input: string };

/**
 * The LODA nature each nature is searched with. LODA files organic laws under `LOI` (production
 * probe, fixture 119: `LOI_ORGANIQUE` finds nothing there although the JORF lists it), so they are
 * searched as `LOI` and told apart by their title (`TITLE_PREFIX`).
 */
const API_NATURE: Record<TextNature, string> = {
  loi: 'LOI',
  loi_organique: 'LOI',
  ordonnance: 'ORDONNANCE',
  decret: 'DECRET',
  arrete: 'ARRETE',
};

/** The folded title a hit must start with when its LODA nature is broader than the one asked. A
 * plain `loi` has none: an organic law is a law. */
const TITLE_PREFIX: Partial<Record<TextNature, string>> = {
  loi_organique: foldKey('Loi organique'),
};

const TEXT_ID = /^(LEGITEXT|JORFTEXT)\d{12}$/;
const TARGETS =
  'Give exactly one target: "id" (LEGITEXT… or JORFTEXT…), "nor", or "nature" with "number" (e.g. nature "loi", number "78-17").';

function flatten(
  section: TextSection,
  parents: string[],
  out: Array<{ article: TextArticle; path: string[] }>,
): void {
  const path = [...parents, section.title];
  for (const article of section.articles) out.push({ article, path });
  for (const child of section.sections) flatten(child, path, out);
}

function findSection(sections: TextSection[], cid: string): TextSection | null {
  for (const s of sections) {
    if (s.cid === cid || s.id === cid) return s;
    const inner = findSection(s.sections, cid);
    if (inner !== null) return inner;
  }
  return null;
}

/** Depth-first, in the order the record lists them; a focused section is walked with its full path from the root. */
function pathTo(sections: TextSection[], target: TextSection, parents: string[]): string[] | null {
  for (const s of sections) {
    if (s === target) return parents;
    const inner = pathTo(s.sections, target, [...parents, s.title]);
    if (inner !== null) return inner;
  }
  return null;
}

function view(
  record: TextRecord,
  asOf: IsoDate,
  url: string,
  sectionCid: string | null,
  warnings: string[] = [],
): TextView {
  const flatArticles: TextView['flatArticles'] = [];
  let focus: TextSection | null = null;
  if (sectionCid === null) {
    for (const article of record.articles) flatArticles.push({ article, path: [] });
    for (const s of record.sections) flatten(s, [], flatArticles);
  } else {
    focus = findSection(record.sections, sectionCid);
    if (focus === null) {
      throw invalid(
        `The text has no section "${sectionCid}". Omit "section_id" to read the whole text.`,
      );
    }
    flatten(focus, pathTo(record.sections, focus, []) ?? [], flatArticles);
  }
  return { record, asOf, url, focus, flatArticles, warnings };
}

/**
 * Reads a whole law, decree or JORF text by id, NOR, or nature + number. A number shared by
 * several texts is `ambiguous` (candidates listed); a number only texts of another nature carry is
 * `other_nature` (listed); `not_found`, with the input echoed, only when Légifrance has nothing.
 * A close match is never substituted. JORFTEXT and NOR are read as published: `atDate` is
 * rejected for them.
 */
export function createGetText(
  repo: LegislationRepository,
  opts: { today?: () => IsoDate } = {},
): (input: GetTextInput, ctx?: CallContext) => Promise<GetTextResult> {
  const today = opts.today ?? todayInParis;
  return async (input, ctx) => {
    const id = blankToNull(input.id);
    const nor = blankToNull(input.nor)?.toUpperCase() ?? null;
    // "n° 78-17" is number 78-17: Légifrance files the number alone.
    const number = blankToNull(
      input.number === undefined ? undefined : normaliseTextNumber(input.number),
    );
    const nature = input.nature ?? null;
    const sectionCid = blankToNull(input.sectionCid);
    const byNumber = nature !== null || number !== null;
    if ([id !== null, nor !== null, byNumber].filter(Boolean).length !== 1) throw invalid(TARGETS);
    if (byNumber && (nature === null || number === null)) {
      throw invalid(`"nature" and "number" go together. ${TARGETS}`);
    }
    if (nature !== null && !(nature in API_NATURE)) {
      throw invalid(
        `Unknown nature "${nature}". Use one of: ${Object.keys(API_NATURE).join(', ')}.`,
      );
    }
    if (id !== null) {
      if (id.startsWith('KALITEXT')) {
        throw invalid(
          `"${id}" is a collective agreement: agreements are not readable whole here. Search them with legifrance_search_legislation (collection "kali").`,
        );
      }
      if (!TEXT_ID.test(id)) {
        throw invalid(
          `"${id}" is not a text id: expected LEGITEXT… or JORFTEXT… followed by 12 digits.`,
        );
      }
    }
    const asPublished = nor !== null || id?.startsWith('JORFTEXT') === true;
    if (input.atDate !== undefined && asPublished) {
      throw invalid(
        '"at_date" does not apply to a JORFTEXT id or a NOR: the text is read as published. Use a LEGITEXT id or nature + number for the version in force on a date.',
      );
    }
    const now = today();
    const asOf = input.atDate === undefined ? now : requireIsoDate(input.atDate, '"at_date"');

    const found = (
      record: TextRecord | null,
      echo: string,
      url: (id: string) => string,
      warnings: string[] = [],
    ) =>
      record === null
        ? ({ kind: 'not_found', input: echo } as const)
        : ({
            kind: 'found',
            text: view(record, asOf, url(record.id), sectionCid, warnings),
          } as const);

    const notInForce = (
      input: string,
      candidates: NotInForceText[],
      more: boolean,
    ): GetTextResult => ({ kind: 'not_in_force', input, asOf, candidates, more });

    /** A LEGITEXT read: found only when its articles' dates put it in force on `asOf`. */
    const readLegitext = (record: TextRecord, echo: string, warnings: string[] = []) => {
      const force = textForceAt(allArticles(record), asOf);
      if (force.verdict === 'in_force') return found(record, echo, lodaUrl, warnings);
      return notInForce(echo, [candidate(record, force)], false);
    };

    if (nor !== null) {
      return found(await repo.getJorfTextByNor(nor, ctx), nor, jorfUrl);
    }
    if (id !== null) {
      if (id.startsWith('JORFTEXT')) return found(await repo.getJorfText(id, ctx), id, jorfUrl);
      const record = await repo.getText(id, asOf, ctx);
      if (record !== null) return readLegitext(record, id);
      // Légifrance answers "unknown id" for a real text read on a date it has no version for
      // (loi 78-17 on 1970-01-01). One read on today tells the two apart; no date is guessed.
      if (asOf === now) return { kind: 'not_found', input: id };
      const current = await repo.getText(id, now, ctx);
      if (current === null) return { kind: 'not_found', input: id };
      return notInForce(id, [candidate(current, { verdict: 'no_version', on: null })], false);
    }

    const echo = `${(nature ?? '').replace(/_/g, ' ')} ${number}`;
    const byNumberOnly = {
      collection: 'loda' as const,
      textNumber: number ?? '',
      atDate: asOf,
      page: 1,
      pageSize: 10,
    };
    const query = {
      ...byNumberOnly,
      nature: API_NATURE[nature as TextNature],
      includeHistorical: false,
    };
    const prefix = TITLE_PREFIX[nature as TextNature];
    const ofNature = (hits: LegislationHit[]) =>
      prefix === undefined ? hits : hits.filter((h) => foldKey(h.title).startsWith(prefix));
    const fetchListed = async (hit: LegislationHit) => {
      const record = await repo.getText(hit.textId, asOf, ctx);
      if (record === null) {
        throw new VigueurError(
          'unexpected_response',
          `Légifrance lists text ${hit.textId} for ${echo} but did not return it.`,
          { source: 'legifrance' },
        );
      }
      return record;
    };

    const first = await repo.searchLegislation(query, ctx);
    const inForce = oneHitPerText(ofNature(first.hits));
    if (inForce.length > 1) {
      return { kind: 'ambiguous', candidates: inForce, more: first.total > first.hits.length };
    }
    const [only] = inForce;
    if (only !== undefined) return readLegitext(await fetchListed(only), echo);

    // The in-force search lists no dates and does not filter by force, so a miss proves nothing.
    // Look at every status and decide from the dates the historical search carries: dates, not labels, decide.
    const page = await repo.searchLegislation({ ...query, includeHistorical: true }, ctx);
    const all = oneHitPerText(ofNature(page.hits));
    if (all.length === 0) {
      // Nothing of this nature, in force or not. A text filed under another nature (or a nature
      // mapped wrongly) may still carry the number: one search on the number alone, every status,
      // lists it rather than calling the text missing.
      const any = await repo.searchLegislation({ ...byNumberOnly, includeHistorical: true }, ctx);
      const candidates = oneHitPerText(any.hits);
      if (candidates.length === 0) return { kind: 'not_found', input: echo };
      return {
        kind: 'other_nature',
        input: echo,
        number: number ?? '',
        candidates,
        more: any.total > any.hits.length,
      };
    }
    const more = page.total > page.hits.length;
    const covering = all.filter((h) => textForceAt([h], asOf).verdict === 'in_force');
    if (covering.length > 1) return { kind: 'ambiguous', candidates: covering, more };
    const [one] = covering;
    if (one === undefined) {
      return notInForce(
        echo,
        all.map((h) => hitCandidate(h, asOf)),
        more,
      );
    }
    return readLegitext(await fetchListed(one), echo, [
      `Légifrance's in-force search did not return this text; its dates say it is in force on ${asOf}.`,
    ]);
  };
}

function allArticles(record: TextRecord): TextArticle[] {
  const out: TextArticle[] = [...record.articles];
  const walk = (sections: TextSection[]) => {
    for (const s of sections) {
      out.push(...s.articles);
      walk(s.sections);
    }
  };
  walk(record.sections);
  return out;
}

function candidate(
  record: TextRecord,
  force: Exclude<TextForce, { verdict: 'in_force' }> | { verdict: 'no_version'; on: null },
) {
  return {
    textId: record.id,
    textCid: record.cid,
    title: record.title,
    nature: record.nature,
    nor: record.nor,
    publishedOn: record.publishedOn,
    verdict: force.verdict,
    on: force.on,
  } satisfies NotInForceText;
}

/** A search hit judged by its own validity window (the historical search carries real dates). */
function hitCandidate(h: LegislationHit, asOf: IsoDate): NotInForceText {
  const force = textForceAt([h], asOf);
  if (force.verdict === 'in_force') throw new Error('hitCandidate: hit is in force');
  return {
    textId: h.textId,
    textCid: h.textCid,
    title: h.title,
    nature: h.nature,
    nor: h.nor,
    publishedOn: h.publishedOn,
    verdict: force.verdict,
    on: force.on,
  };
}

/** One text = one JORFTEXT cid: its LEGITEXT containers collapse to one hit (not MODIFIE first, then highest id). */
function oneHitPerText(hits: LegislationHit[]): LegislationHit[] {
  const byText = new Map<string, LegislationHit>();
  for (const h of hits) {
    const key = h.textCid ?? h.textId;
    const held = byText.get(key);
    if (held === undefined || better(h, held)) byText.set(key, h);
  }
  return [...byText.values()];
}

function better(a: LegislationHit, b: LegislationHit): boolean {
  const aModified = a.rawStatus === 'MODIFIE';
  const bModified = b.rawStatus === 'MODIFIE';
  if (aModified !== bModified) return !aModified;
  return a.textId > b.textId;
}
