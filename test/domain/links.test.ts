import { describe, expect, it } from 'vitest';
import {
  articleUrl,
  jorfUrl,
  kaliUrl,
  LEGIFRANCE_BASE_URL,
  lodaUrl,
} from '../../src/domain/links.js';

describe('links', () => {
  it('builds official URLs', () => {
    expect(LEGIFRANCE_BASE_URL).toBe('https://www.legifrance.gouv.fr');
    expect(articleUrl('LEGIARTI000032041571')).toBe(
      'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032041571',
    );
    expect(lodaUrl('LEGITEXT000006070721')).toBe(
      'https://www.legifrance.gouv.fr/loda/id/LEGITEXT000006070721',
    );
    expect(jorfUrl('JORFTEXT000000000001')).toBe(
      'https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000000000001',
    );
    expect(kaliUrl('KALITEXT000000000001')).toBe(
      'https://www.legifrance.gouv.fr/conv_coll/id/KALITEXT000000000001',
    );
  });
});
