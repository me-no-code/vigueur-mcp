import type { Config, PisteEnv } from '../config.js';
import type { SourceId } from '../shared/source-id.js';
import { SOURCE_IDS } from '../shared/source-id.js';

export const HEALTH_STATES = [
  'ok',
  'not_enabled',
  'credentials_invalid',
  'quota_exceeded',
  'unavailable',
] as const;
export type HealthState = (typeof HEALTH_STATES)[number];

export interface SourceHealth {
  source: SourceId;
  state: HealthState;
  detail?: string;
  retryAfterSeconds?: number;
}

export type SourceProbe = () => Promise<SourceHealth>;

export interface StatusReport {
  configured: boolean;
  env: PisteEnv | null;
  configProblems: string[];
  sources: SourceHealth[];
}

async function runProbe(source: SourceId, probe: SourceProbe): Promise<SourceHealth> {
  try {
    return await probe();
  } catch (err) {
    return {
      source,
      state: 'unavailable',
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function getStatus(deps: {
  config: Config;
  probes: Partial<Record<SourceId, SourceProbe>>;
}): Promise<StatusReport> {
  const { config, probes } = deps;
  if (config.piste === null) {
    return { configured: false, env: null, configProblems: config.problems, sources: [] };
  }
  const pending: Array<Promise<SourceHealth>> = [];
  for (const source of SOURCE_IDS) {
    const probe = probes[source];
    if (probe) pending.push(runProbe(source, probe));
  }
  return {
    configured: true,
    env: config.piste.env,
    configProblems: config.problems,
    sources: await Promise.all(pending),
  };
}
