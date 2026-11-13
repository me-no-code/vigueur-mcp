import type { IsoDate } from './dates.js';
import type { ArticleVersion, LegalStatus } from './versions.js';

export interface StatusAt {
  inForce: boolean;
  reason: 'in_force' | 'not_yet_in_force' | 'ended' | 'never_applied';
  from: IsoDate | null;
  until: IsoDate | null;
}

export function statusAt(
  // validFrom null = unknown start, treated as "since the beginning" (in force unless ended).
  v: Pick<ArticleVersion, 'status' | 'validTo'> & { validFrom: IsoDate | null },
  date: IsoDate,
): StatusAt {
  const { validFrom: from, validTo: until } = v;
  if (v.status === 'stillborn') return { inForce: false, reason: 'never_applied', from, until };
  if (from !== null && date < from)
    return { inForce: false, reason: 'not_yet_in_force', from, until };
  if (until !== null && date >= until) return { inForce: false, reason: 'ended', from, until };
  return { inForce: true, reason: 'in_force', from, until };
}

/**
 * Whether a version applied on `date` by its dates alone (validFrom ≤ date < validTo). A
 * still-born version never applied; an unknown start is never assumed to cover a date.
 */
export function coversDate(
  v: { status: LegalStatus; validFrom: IsoDate | null; validTo: IsoDate | null },
  date: IsoDate,
): boolean {
  return (
    v.status !== 'stillborn' &&
    v.validFrom !== null &&
    v.validFrom <= date &&
    (v.validTo === null || date < v.validTo)
  );
}

export interface ModificationLink {
  kind: 'creation' | 'modification' | 'abrogation' | 'codification' | 'other';
  textTitle: string;
  effectiveDate: IsoDate | null;
}

export function consistencyWarnings(
  v: Pick<ArticleVersion, 'status'>,
  links: readonly ModificationLink[],
  date: IsoDate,
): string[] {
  if (v.status !== 'in_force' && v.status !== 'deferred') return [];
  const warnings: string[] = [];
  for (const l of links) {
    if (l.kind === 'abrogation' && l.effectiveDate !== null && l.effectiveDate <= date) {
      const marks = v.status === 'deferred' ? 'as entering into force' : 'in force';
      warnings.push(
        `Légifrance marks this version ${marks}, but also records its abrogation by ${l.textTitle} (effective ${l.effectiveDate}).`,
      );
    }
  }
  return warnings;
}
