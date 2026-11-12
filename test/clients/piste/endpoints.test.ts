import { describe, expect, it } from 'vitest';
import { pisteEndpoints } from '../../../src/clients/piste/endpoints.js';

describe('pisteEndpoints', () => {
  it('returns production URLs', () => {
    expect(pisteEndpoints('production')).toEqual({
      oauthTokenUrl: 'https://oauth.piste.gouv.fr/api/oauth/token',
      legifranceBaseUrl: 'https://api.piste.gouv.fr/dila/legifrance/lf-engine-app',
      judilibreBaseUrl: 'https://api.piste.gouv.fr/cassation/judilibre/v1.0',
    });
  });
  it('returns sandbox URLs', () => {
    expect(pisteEndpoints('sandbox')).toEqual({
      oauthTokenUrl: 'https://sandbox-oauth.piste.gouv.fr/api/oauth/token',
      legifranceBaseUrl: 'https://sandbox-api.piste.gouv.fr/dila/legifrance/lf-engine-app',
      judilibreBaseUrl: 'https://sandbox-api.piste.gouv.fr/cassation/judilibre/v1.0',
    });
  });
});
