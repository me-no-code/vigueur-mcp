export const SOURCE_IDS = ['legifrance', 'judilibre'] as const;

export type SourceId = (typeof SOURCE_IDS)[number];

export const SOURCE_LABELS: Record<SourceId, string> = {
  legifrance: 'Légifrance',
  judilibre: 'Judilibre',
};
