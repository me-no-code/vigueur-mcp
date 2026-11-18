import type { IsoDate } from './dates.js';

export type LegalStatus =
  | 'in_force'
  | 'deferred'
  | 'repeal_pending'
  | 'amended'
  | 'repealed'
  | 'stillborn'
  | 'annulled'
  | 'severed'
  | 'expired'
  | 'transferred'
  | 'replaced'
  | 'denounced'
  | 'initial'
  | 'unknown';

export interface ArticleVersion {
  id: string;
  number: string;
  text: string;
  status: LegalStatus;
  /** Status label as sent by the source, kept for display. */
  rawStatus?: string;
  validFrom: IsoDate;
  /** `null` = no end date, or an end whose date is not determined yet (see below). */
  validTo: IsoDate | null;
  /** The source records an end (a scheduled repeal) whose date it has not set yet. */
  validToUndetermined?: boolean;
}
