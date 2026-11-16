import type { IsoDate } from '../../domain/dates.js';
import { minusDays } from '../../domain/dates.js';
import { foldKey } from '../../domain/text.js';
import type { LegalStatus } from '../../domain/versions.js';
import type { CallContext, JoGroup, JoIssue, LegislationRepository } from './ports.js';
import { invalid, requireIsoDate, todayInParis } from './resolve.js';

const MAX_ISSUES_PER_DATE = 3;

/** How many of the latest issues are read when neither `count` nor `date` is given. */
export const DEFAULT_ISSUE_COUNT = 1;

export interface LatestJoInput {
  count?: number;
  date?: IsoDate;
  nature?: string;
  emitter?: string;
}

export interface LatestJoView {
  /** Publication dates. Issues are kept when the filters match nothing (groups empty). */
  issues: JoIssue[];
  filter: { nature: string | null; emitter: string | null; matchedEmitters: string[] };
  /** Texts left after filtering. */
  totalTexts: number;
  /** Distinct values over the selected issues before filtering, most frequent first. */
  available: { natures: string[]; emitters: string[] };
}

function ranked(counts: Map<string, number>): string[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr'))
    .map(([value]) => value);
}

function bump(counts: Map<string, number>, value: string | null): void {
  if (value === null || value.trim() === '') return;
  counts.set(value, (counts.get(value) ?? 0) + 1);
}

/**
 * The latest Journal officiel issues (or those of one publication date), optionally narrowed
 * to a nature and/or an emitter. Emitter names drift between spellings, so the emitter filter
 * is a folded substring match over ministry and emitter, and lists the spellings it matched.
 */
export function createLatestJo(
  repo: LegislationRepository,
  _opts: { today?: () => IsoDate } = {},
): (input: LatestJoInput, ctx?: CallContext) => Promise<LatestJoView> {
  return async (input, ctx) => {
    const natureRaw = input.nature?.trim() || null;
    const emitterRaw = input.emitter?.trim() || null;
    const emitterKey = emitterRaw === null ? null : foldKey(emitterRaw);
    if (emitterKey === '') throw invalid(`"emitter" has no letters or digits: "${input.emitter}".`);
    const natureKey = natureRaw === null ? null : foldKey(natureRaw);

    let selected: JoIssue[];
    if (input.date !== undefined) {
      const date = requireIsoDate(input.date, '"date"');
      const listed = (await repo.joIssuesBetween(date, date, ctx)).slice(0, MAX_ISSUES_PER_DATE);
      const read: JoIssue[] = [];
      for (const issue of listed) {
        const full = await repo.joIssue(issue.id, ctx);
        if (full !== null) read.push(full);
      }
      selected = read;
    } else {
      const count = input.count ?? DEFAULT_ISSUE_COUNT;
      if (!Number.isInteger(count) || count < 1 || count > 10) {
        throw invalid(`"count" must be a whole number from 1 to 10 (got ${count}).`);
      }
      selected = await repo.latestJo(count, ctx);
    }

    const natureCounts = new Map<string, number>();
    const emitterCounts = new Map<string, number>();
    for (const issue of selected) {
      for (const group of issue.groups ?? []) {
        for (const t of group.texts) {
          bump(natureCounts, t.nature);
          bump(emitterCounts, t.ministry ?? t.emitter);
        }
      }
    }

    const matched = new Set<string>();
    let totalTexts = 0;
    const issues = selected.map((issue): JoIssue => {
      const groups: JoGroup[] = [];
      for (const group of issue.groups ?? []) {
        const texts = group.texts.filter((t) => {
          if (natureKey !== null && foldKey(t.nature ?? '') !== natureKey) return false;
          if (emitterKey !== null) {
            const hits = [t.ministry, t.emitter].filter(
              (s): s is string => s !== null && foldKey(s).includes(emitterKey),
            );
            if (hits.length === 0) return false;
            for (const h of hits) matched.add(h);
          }
          return true;
        });
        if (texts.length > 0) groups.push({ ...group, texts });
        totalTexts += texts.length;
      }
      return { ...issue, groups: issue.groups === null ? null : groups };
    });

    return {
      issues,
      filter: { nature: natureRaw, emitter: emitterRaw, matchedEmitters: [...matched] },
      totalTexts,
      available: { natures: ranked(natureCounts), emitters: ranked(emitterCounts) },
    };
  };
}

export type ReferenceKind = 'codes' | 'jorf_natures' | 'jorf_emitters';

export interface ReferenceView {
  kind: ReferenceKind;
  /** Start of the publication window for JORF facets; null for codes. */
  since: IsoDate | null;
  values: Array<{
    value: string;
    count: number | null;
    id: string | null;
    status: LegalStatus | null;
  }>;
  /** When the cached code list was fetched; null for the JORF lists, which are not cached. */
  fetchedAt: Date | null;
}

/** Start of the publication window of the JORF lists when `since` is not given: a year before `today`. */
export function referenceSince(today: IsoDate): IsoDate {
  return minusDays(today, 365);
}

/** Values the other tools accept: code titles, or the natures / emitters seen in recent JORF texts. */
export function createListReferenceValues(
  repo: LegislationRepository,
  opts: { today?: () => IsoDate } = {},
): (input: { kind: ReferenceKind; since?: IsoDate }, ctx?: CallContext) => Promise<ReferenceView> {
  const todayOf = opts.today ?? todayInParis;
  return async (input, ctx) => {
    if (input.kind === 'codes') {
      const { codes, fetchedAt } = await repo.listCodes(ctx);
      return {
        kind: 'codes',
        since: null,
        fetchedAt,
        values: codes
          .map((c) => ({ value: c.title, count: null, id: c.id, status: c.status }))
          .sort((a, b) => a.value.localeCompare(b.value, 'fr')),
      };
    }
    const today = todayOf();
    const since =
      input.since === undefined ? referenceSince(today) : requireIsoDate(input.since, '"since"');
    if (since > today) throw invalid(`"since" (${since}) is after today (${today}).`);
    const facets = await repo.jorfFacets(since, today, ctx);
    const list = input.kind === 'jorf_natures' ? facets.natures : facets.emitters;
    return {
      kind: input.kind,
      since,
      fetchedAt: null,
      values: list.map((f) => ({ value: f.value, count: f.count, id: null, status: null })),
    };
  };
}
