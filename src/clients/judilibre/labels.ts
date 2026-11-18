import { labelOf } from '../../domain/judilibre-labels.js';
import type { Labelled } from '../../services/case-law/ports.js';

/** A key with its label from `table`; an unknown key is its own label. */
export function labelled(table: Readonly<Record<string, string>>, key: string): Labelled {
  return { key, label: labelOf(table, key) };
}
