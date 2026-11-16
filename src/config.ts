export const PISTE_ENVS = ['production', 'sandbox'] as const;
export type PisteEnv = (typeof PISTE_ENVS)[number];
export interface PisteConfig {
  clientId: string;
  clientSecret: string;
  env: PisteEnv;
}
export interface Config {
  piste: PisteConfig | null;
  problems: string[];
}

/** Where a user changes the PISTE_* values: plugin settings in Claude Code, env vars elsewhere. */
export const CREDENTIALS_WHERE =
  'In Claude Code with the Vigueur plugin, they are the plugin settings: change them with /plugin configure vigueur@vigueur, then reconnect with /mcp. In another MCP client, they are environment variables in its configuration.';

/** Trim, strip one matching pair of surrounding quotes, trim again; empty means unset. */
function clean(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  let v = value.trim();
  const first = v[0];
  if (v.length >= 2 && (first === '"' || first === "'") && v.endsWith(first)) {
    v = v.slice(1, -1).trim();
  }
  return v === '' ? undefined : v;
}

export function loadConfig(env: Record<string, string | undefined>): Config {
  const clientId = clean(env.PISTE_CLIENT_ID);
  const clientSecret = clean(env.PISTE_CLIENT_SECRET);

  if (clientId === undefined && clientSecret === undefined) {
    return { piste: null, problems: [] };
  }
  if (clientId === undefined) {
    return {
      piste: null,
      problems: ['PISTE_CLIENT_ID is missing (PISTE_CLIENT_SECRET is set)'],
    };
  }
  if (clientSecret === undefined) {
    return {
      piste: null,
      problems: ['PISTE_CLIENT_SECRET is missing (PISTE_CLIENT_ID is set)'],
    };
  }

  const rawEnv = clean(env.PISTE_ENV) ?? 'production';
  const pisteEnv = rawEnv.toLowerCase();
  if (pisteEnv !== 'production' && pisteEnv !== 'sandbox') {
    // Echo only short alphabetic values: anything else may be a secret pasted into the wrong var.
    const got = /^[A-Za-z-]{1,20}$/.test(rawEnv) ? `"${rawEnv}"` : 'an unrecognised value';
    return {
      piste: null,
      problems: [`PISTE_ENV must be "production" or "sandbox" (got ${got})`],
    };
  }
  return { piste: { clientId, clientSecret, env: pisteEnv }, problems: [] };
}
