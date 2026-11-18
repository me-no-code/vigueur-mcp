import { sameWording } from './changes.js';

export interface ArticleRef {
  id: string;
  num: string | null;
  codeTitle: string | null;
  label: string;
}

/** Exact facts about what followed a version: same wording or not, and where it moved. */
export interface Relocation {
  /** Whether the next version has the same words; `null` when there is no later text to compare. */
  sameWording: boolean | null;
  /** Where Légifrance concordance says the content went. */
  movedTo: ArticleRef[];
}

export function assessRelocation(input: {
  earlierText: string;
  laterText: string | null;
  concordanceTo: readonly ArticleRef[];
}): Relocation {
  return {
    sameWording: input.laterText === null ? null : sameWording(input.earlierText, input.laterText),
    movedTo: [...input.concordanceTo],
  };
}
