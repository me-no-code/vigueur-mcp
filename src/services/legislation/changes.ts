import type { IsoDate } from '../../domain/dates.js';
import type { CallContext, ChangeEntry, LegislationRepository } from './ports.js';
import { invalid, requireIsoDate, resolveCode, todayInParis } from './resolve.js';

export interface ChangesView {
  textTitle: string;
  textId: string;
  since: IsoDate;
  until: IsoDate;
  groups: Array<{ amendingTitle: string; entries: ChangeEntry[] }>;
  /** Entries dated after today: not yet in force. */
  scheduledCount: number;
  undeterminedCount: number;
  detailMissingYears: string[];
  totalEntries: number;
}

const byDateThenNumber = (a: ChangeEntry, b: ChangeEntry) =>
  a.date.localeCompare(b.date) ||
  (a.articleNum ?? '').localeCompare(b.articleNum ?? '', 'fr', { numeric: true });

/**
 * Changes to a code between two dates, grouped by amending text. Codes only for now
 * (LODA texts need their JORFTEXT cid and come later).
 */
export function createListChanges(
  repo: LegislationRepository,
  opts: { today?: () => IsoDate } = {},
): (
  input: { code: string; since: IsoDate; until?: IsoDate },
  ctx?: CallContext,
) => Promise<ChangesView> {
  const todayOf = opts.today ?? todayInParis;
  return async (input, ctx) => {
    const today = todayOf();
    const since = requireIsoDate(input.since, 'since');
    const until = input.until === undefined ? today : requireIsoDate(input.until, 'until');
    if (until < since) {
      throw invalid(`"until" (${until}) is before "since" (${since}).`);
    }

    const resolved = await resolveCode(repo, input.code, ctx);
    if (resolved.code === null) {
      const hint =
        resolved.didYouMean.length > 0
          ? ` Did you mean: ${resolved.didYouMean.join('; ')}?`
          : ' Use the exact title of a code, e.g. "Code du travail". Only codes are supported.';
      throw invalid(`Unknown code "${input.code}".${hint}`);
    }

    const log = await repo.listChanges(resolved.code.id, since, until, ctx);
    const byTitle = new Map<string, ChangeEntry[]>();
    for (const e of log.entries) {
      const group = byTitle.get(e.amendingTitle);
      if (group) group.push(e);
      else byTitle.set(e.amendingTitle, [e]);
    }
    const groups = [...byTitle.entries()]
      .map(([amendingTitle, entries]) => ({
        amendingTitle,
        entries: entries.sort(byDateThenNumber),
      }))
      .sort(
        (a, b) =>
          (a.entries[0]?.date ?? '').localeCompare(b.entries[0]?.date ?? '') ||
          a.amendingTitle.localeCompare(b.amendingTitle, 'fr'),
      );

    return {
      textTitle: resolved.code.title,
      textId: resolved.code.id,
      since,
      until,
      groups,
      scheduledCount: log.entries.filter((e) => e.date > today).length,
      undeterminedCount: log.undeterminedCount,
      detailMissingYears: log.detailMissingYears,
      totalEntries: log.entries.length,
    };
  };
}
