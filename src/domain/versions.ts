import type { IsoDate } from './dates.js';

export type LegalStatus =
  | 'in_force'
  | 'repealed'
  | 'amended'
  | 'deferred'
  | 'annulled'
  | 'transferred'
  | 'expired'
  | 'unknown';

export interface ArticleVersion {
  id: string;
  number: string;
  text: string;
  status: LegalStatus;
  validFrom: IsoDate;
  validTo: IsoDate | null;
}

/** Version in force on `date` (validFrom <= date < validTo); latest validFrom wins. */
export function versionAt(
  versions: readonly ArticleVersion[],
  date: IsoDate,
): ArticleVersion | null {
  let best: ArticleVersion | null = null;
  for (const v of versions) {
    if (v.validFrom <= date && (v.validTo === null || date < v.validTo)) {
      if (best === null || v.validFrom > best.validFrom) best = v;
    }
  }
  return best;
}
