export const SOURCE_IDS = ['legifrance', 'judilibre'] as const;

export type SourceId = (typeof SOURCE_IDS)[number];

export const SOURCE_LABELS = {
  legifrance: 'Légifrance',
  judilibre: 'Judilibre',
} as const satisfies Record<SourceId, string>;
