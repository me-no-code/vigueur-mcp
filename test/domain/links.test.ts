import { describe, expect, it } from 'vitest';
import {
  articleUrl,
  articleUrlFor,
  codeSectionUrl,
  codeUrl,
  joIssueUrl,
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

  it('links an article by its id prefix', () => {
    expect(articleUrlFor('LEGIARTI000032041571')).toBe(
      'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032041571',
    );
    expect(articleUrlFor('KALIARTI000005849443')).toBe(
      'https://www.legifrance.gouv.fr/conv_coll/article/KALIARTI000005849443',
    );
    expect(articleUrlFor('JORFARTI000033934948')).toBe(
      'https://www.legifrance.gouv.fr/jorf/article_jo/JORFARTI000033934948',
    );
  });

  it('builds code, code section and JO issue URLs', () => {
    expect(codeUrl('LEGITEXT000006070721')).toBe(
      'https://www.legifrance.gouv.fr/codes/texte_lc/LEGITEXT000006070721',
    );
    expect(codeSectionUrl('LEGITEXT000006070721', 'LEGISCTA000006089696')).toBe(
      'https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000006070721/LEGISCTA000006089696',
    );
    expect(joIssueUrl('/eli/jo/2026/11/11/0264')).toBe(
      'https://www.legifrance.gouv.fr/eli/jo/2026/11/11/0264',
    );
  });
});
