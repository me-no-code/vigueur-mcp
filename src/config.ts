export const PISTE_ENVS = ['production', 'sandbox'] as const;
export type PisteEnv = (typeof PISTE_ENVS)[number];
export interface PisteConfig {
  clientId: string;
  clientSecret: string;
  env: PisteEnv;
}
/**
 * Usable credentials, or none and why. A configured server has no problems by construction, so
 * a new problem must decide which side it belongs to rather than be carried and dropped.
 */
export type Config = { piste: PisteConfig; problems: [] } | { piste: null; problems: string[] };

/** A `${user_config.KEY}` an app passed through unfilled. */
const UNFILLED = /^\$\{user_config\.[A-Za-z0-9_]+\}$/;

/**
 * Trim, strip one matching pair of surrounding quotes, trim again; empty or an unfilled
 * `${user_config.…}` placeholder means unset.
 */
function clean(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  let v = value.trim();
  const first = v[0];
  if (v.length >= 2 && (first === '"' || first === "'") && v.endsWith(first)) {
    v = v.slice(1, -1).trim();
  }
  return v === '' || UNFILLED.test(v) ? undefined : v;
}

/** Echo only short alphabetic values: anything else may be a secret pasted into the wrong var. */
const echo = (raw: string): string =>
  /^[A-Za-z-]{1,20}$/.test(raw) ? `"${raw}"` : 'an unrecognised value';

const unconfigured = (problem: string): Config => ({ piste: null, problems: [problem] });

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

  let pisteEnv: PisteEnv | undefined;
  const rawEnv = clean(env.PISTE_ENV);
  if (rawEnv !== undefined) {
    const value = rawEnv.toLowerCase();
    if (value !== 'production' && value !== 'sandbox') {
      return unconfigured(`PISTE_ENV must be "production" or "sandbox" (got ${echo(rawEnv)})`);
    }
    pisteEnv = value;
  }
  // PISTE_PRODUCTION is the same choice as a yes/no, for apps whose settings offer a switch.
  const rawProduction = clean(env.PISTE_PRODUCTION);
  if (rawProduction !== undefined) {
    const value = rawProduction.toLowerCase();
    if (value !== 'true' && value !== 'false') {
      return unconfigured(
        `PISTE_PRODUCTION must be "true" or "false" (got ${echo(rawProduction)})`,
      );
    }
    const chosen: PisteEnv = value === 'true' ? 'production' : 'sandbox';
    if (pisteEnv !== undefined && pisteEnv !== chosen) {
      return unconfigured(
        `PISTE_ENV is "${pisteEnv}" but PISTE_PRODUCTION is "${value}": set only one`,
      );
    }
    pisteEnv = chosen;
  }
  return { piste: { clientId, clientSecret, env: pisteEnv ?? 'production' }, problems: [] };
}
