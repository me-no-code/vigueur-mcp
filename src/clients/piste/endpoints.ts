import type { PisteEnv } from '../../config.js';

export interface PisteEndpoints {
  oauthTokenUrl: string;
  legifranceBaseUrl: string;
  judilibreBaseUrl: string;
}

const HOSTS: Record<PisteEnv, { oauth: string; api: string }> = {
  production: { oauth: 'https://oauth.piste.gouv.fr', api: 'https://api.piste.gouv.fr' },
  sandbox: {
    oauth: 'https://sandbox-oauth.piste.gouv.fr',
    api: 'https://sandbox-api.piste.gouv.fr',
  },
};

export function pisteEndpoints(env: PisteEnv): PisteEndpoints {
  const { oauth, api } = HOSTS[env];
  return {
    oauthTokenUrl: `${oauth}/api/oauth/token`,
    legifranceBaseUrl: `${api}/dila/legifrance/lf-engine-app`,
    judilibreBaseUrl: `${api}/cassation/judilibre/v1.0`,
  };
}
