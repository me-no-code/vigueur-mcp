import type { Config, PisteEnv } from '../config.js';
import type { SourceId } from '../shared/source-id.js';
import { SOURCE_IDS } from '../shared/source-id.js';

export const HEALTH_STATES = [
  'ok',
  'not_enabled',
  'credentials_invalid',
  'quota_exceeded',
  'unexpected_response',
  'unavailable',
] as const;
export type HealthState = (typeof HEALTH_STATES)[number];

export interface SourceHealth {
  source: SourceId;
  state: HealthState;
  detail?: string;
  retryAfterSeconds?: number;
}

/** What a status call carries: the signal that bounds it (deadline and client cancel). */
export interface StatusContext {
  signal?: AbortSignal;
}

export type SourceProbe = (ctx?: StatusContext) => Promise<SourceHealth>;

export type StatusReport =
  | { configured: false; env: null; configProblems: string[]; sources: [] }
  | { configured: true; env: PisteEnv; sources: SourceHealth[] };

async function runProbe(
  source: SourceId,
  probe: SourceProbe,
  ctx: StatusContext | undefined,
): Promise<SourceHealth> {
  try {
    return await probe(ctx);
  } catch (err) {
    return {
      source,
      state: 'unavailable',
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function getStatus(
  deps: {
    config: Config;
    probes: Partial<Record<SourceId, SourceProbe>>;
  },
  ctx?: StatusContext,
): Promise<StatusReport> {
  const { config, probes } = deps;
  if (config.piste === null) {
    return { configured: false, env: null, configProblems: config.problems, sources: [] };
  }
  const pending: Array<Promise<SourceHealth>> = [];
  for (const source of SOURCE_IDS) {
    const probe = probes[source];
    if (probe) pending.push(runProbe(source, probe, ctx));
  }
  return { configured: true, env: config.piste.env, sources: await Promise.all(pending) };
}
