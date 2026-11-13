export const LEGIFRANCE_BASE_URL = 'https://www.legifrance.gouv.fr';

export function articleUrl(legiartiId: string): string {
  return `${LEGIFRANCE_BASE_URL}/codes/article_lc/${legiartiId}`;
}
/**
 * Official page of an article by its id: collective agreement (`KALIARTI…`), Journal officiel
 * (`JORFARTI…`) or code article.
 */
export function articleUrlFor(articleId: string): string {
  if (articleId.startsWith('KALIARTI'))
    return `${LEGIFRANCE_BASE_URL}/conv_coll/article/${articleId}`;
  if (articleId.startsWith('JORFARTI'))
    return `${LEGIFRANCE_BASE_URL}/jorf/article_jo/${articleId}`;
  return articleUrl(articleId);
}
export function lodaUrl(legitextId: string): string {
  return `${LEGIFRANCE_BASE_URL}/loda/id/${legitextId}`;
}
export function jorfUrl(jorftextId: string): string {
  return `${LEGIFRANCE_BASE_URL}/jorf/id/${jorftextId}`;
}
export function kaliUrl(kalitextId: string): string {
  return `${LEGIFRANCE_BASE_URL}/conv_coll/id/${kalitextId}`;
}
