import type { IsoDate } from './dates.js';
import { coversDate } from './status-at.js';
import type { LegalStatus } from './versions.js';

export interface DatedArticle {
  /** Only `stillborn` is read (see `textForceAt`); every other label is ignored. */
  status?: LegalStatus;
  validFrom: IsoDate | null;
  validTo: IsoDate | null;
}

export type TextForce =
  | { verdict: 'in_force' }
  /** Every article starts after the date: `on` is the earliest start. */
  | { verdict: 'not_yet'; on: IsoDate }
  /** No article applies any more: `on` is the latest real end (null when none is recorded). */
  | { verdict: 'ended' | 'undetermined'; on: IsoDate | null };

/**
 * Whether a text is in force on `date`, decided from its articles' dates alone:
 * in force iff some article covers the date (validFrom ≤ date < validTo; an unknown start never
 * covers; a degenerate window with from == to covers nothing). One label exception, on purpose:
 * a version marked stillborn (MODIFIE_MORT_NE) never entered into force, so it never covers. Every
 * other label (repealed, modified, in force…) and the consolidated version window of the text are
 * ignored: the dates decide. Never assumes in force.
 */
export function textForceAt(articles: readonly DatedArticle[], date: IsoDate): TextForce {
  let earliestStart: IsoDate | null = null;
  let latestEnd: IsoDate | null = null;
  for (const a of articles) {
    const covers = coversDate(
      {
        validFrom: a.validFrom,
        validTo: a.validTo,
        status: a.status === 'stillborn' ? 'stillborn' : 'in_force',
      },
      date,
    );
    if (covers) return { verdict: 'in_force' };
    if (a.validFrom !== null && a.validTo !== null && a.validFrom >= a.validTo) continue;
    if (a.validFrom !== null && a.validFrom > date) {
      if (earliestStart === null || a.validFrom < earliestStart) earliestStart = a.validFrom;
    } else if (a.validTo !== null && a.validTo <= date) {
      if (latestEnd === null || a.validTo > latestEnd) latestEnd = a.validTo;
    }
  }
  if (earliestStart !== null) return { verdict: 'not_yet', on: earliestStart };
  if (latestEnd !== null) return { verdict: 'ended', on: latestEnd };
  return { verdict: 'undetermined', on: null };
}
