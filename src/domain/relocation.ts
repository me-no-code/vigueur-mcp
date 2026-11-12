import { type ChangeKind, classifyChange } from './changes.js';

export interface ArticleRef {
  id: string;
  num: string | null;
  codeTitle: string | null;
  label: string;
}

export interface Relocation {
  change: ChangeKind;
  movedTo: ArticleRef[];
  evidence: Array<'concordance' | 'text_similarity' | 'section_change'>;
}

export function assessRelocation(input: {
  earlierText: string;
  laterText: string | null;
  concordanceTo: readonly ArticleRef[];
  sectionChanged: boolean;
}): Relocation {
  const change = classifyChange(input.earlierText, input.laterText ?? '');
  const movedTo = [...input.concordanceTo];
  const evidence: Relocation['evidence'] = [];
  if (movedTo.length > 0) evidence.push('concordance');
  if (change === 'replaced') evidence.push('text_similarity');
  if (input.sectionChanged) evidence.push('section_change');
  return { change, movedTo, evidence };
}
