import type { FixtureRoute } from './fixture-fetch.js';

const J = (path: string, fixture: string, whenQuery?: FixtureRoute['whenQuery']): FixtureRoute => ({
  api: 'judilibre',
  path,
  fixture,
  ...(whenQuery && { whenQuery }),
});

/** The recorded Judilibre fixtures, by path and query, shared by the Judilibre tests. */
export const JUDILIBRE_ROUTES: readonly FixtureRoute[] = [
  J(
    '/search',
    '11-search-eval-forfait-jours-exact-cc-soc-date-desc',
    (q) => q.get('query') === 'forfait jours',
  ),
  J('/search', '61-search-number-23-20.348-rnsm', (q) => q.get('query') === '23-20.348'),
  J('/search', '19-search-type-arret-cc-recent', (q) => q.get('query') === 'licenciement'),
  J('/search', '21-search-ca-paris-bail-date-desc', (q) => q.get('query') === 'bail'),
  J('/search', '15-search-page-beyond-total', (q) => q.get('query') === '24-16.924'),
  J('/decision', '49-decision-ca-paris', (q) => q.get('id') === '6aead2477a1020213711b3db'),
  J('/decision', '62-decision-23-20.348-rnsm', (q) => q.get('id') === '6a0e9ff1cdc6046d47668703'),
  J(
    '/decision',
    '47-decision-23-23.782-bulletin-files',
    (q) => q.get('id') === '6af2c6c06c2e1778126fe2c7',
  ),
  J('/decision', '45-decision-24-16.924', (q) => q.get('id') === '694252ab61c46255e1711cac'),
  J(
    '/decision',
    '67-decision-11-16.304-bulletin-no-zones',
    (q) => q.get('id') === '607976659ba5988459c49f42',
  ),
  {
    ...J(
      '/decision',
      '53-err-decision-unknown-id',
      (q) => q.get('id') === '000000000000000000000000',
    ),
    status: 404,
  },
  J('/taxonomy', '29-taxonomy-cc-chamber', (q) => q.get('id') === 'chamber'),
];
