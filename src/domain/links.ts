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
export function codeUrl(legitextId: string): string {
  return `${LEGIFRANCE_BASE_URL}/codes/texte_lc/${legitextId}`;
}
export function codeSectionUrl(legitextId: string, legiscta: string): string {
  return `${LEGIFRANCE_BASE_URL}/codes/section_lc/${legitextId}/${legiscta}`;
}
/** Official page of a Journal officiel issue from its ELI path (e.g. `/eli/jo/2026/11/11/0264`). */
export function joIssueUrl(eliPath: string): string {
  return `${LEGIFRANCE_BASE_URL}${eliPath}`;
}

const DECISION_PATHS: Readonly<Record<string, string>> = {
  JURITEXT: 'juri',
  CETATEXT: 'ceta',
  CONSTEXT: 'cons',
  CNILTEXT: 'cnil',
  JUFITEXT: 'jufi',
};
const DECISION_ID = /^[A-Z]{8}\d{12}$/;
/** Official Légifrance page of a case-law decision; the id prefix decides the path. */
export function decisionUrl(id: string): string {
  const prefix = id.slice(0, 8);
  // `Object.hasOwn`: an inherited key such as `toString` is not a prefix.
  const path =
    DECISION_ID.test(id) && Object.hasOwn(DECISION_PATHS, prefix)
      ? DECISION_PATHS[prefix]
      : undefined;
  if (path === undefined) throw new Error(`Not a Légifrance decision id: ${id}`);
  return `${LEGIFRANCE_BASE_URL}/${path}/id/${id}`;
}
/** Official Cour de cassation page of a Judilibre decision. */
export function judilibreDecisionUrl(id: string): string {
  return `https://www.courdecassation.fr/decision/${id}`;
}
