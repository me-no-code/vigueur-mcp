import { describe, expect, it, vi } from 'vitest';
import type { Config } from '../../src/config.js';
import type { SourceHealth, SourceProbe } from '../../src/services/status.js';
import { getStatus } from '../../src/services/status.js';

const configured: Config = {
  piste: { clientId: 'id', clientSecret: 'secret', env: 'sandbox' },
  problems: [],
};

describe('getStatus', () => {
  it('does not call probes when unconfigured and passes problems through', async () => {
    const legifrance = vi.fn<SourceProbe>();
    const judilibre = vi.fn<SourceProbe>();
    const report = await getStatus({
      config: { piste: null, problems: ['PISTE_CLIENT_ID is missing'] },
      probes: { legifrance, judilibre },
    });
    expect(report).toEqual({
      configured: false,
      env: null,
      configProblems: ['PISTE_CLIENT_ID is missing'],
      sources: [],
    });
    expect(legifrance).not.toHaveBeenCalled();
    expect(judilibre).not.toHaveBeenCalled();
  });

  it('passes config problems through when configured', async () => {
    const report = await getStatus({
      config: { ...configured, problems: ['PISTE_ENV unknown, using production'] },
      probes: {},
    });
    expect(report.configProblems).toEqual(['PISTE_ENV unknown, using production']);
    expect(report.configured).toBe(true);
    expect(report.env).toBe('sandbox');
  });

  it('orders results as SOURCE_IDS even when judilibre resolves first', async () => {
    const legifrance: SourceProbe = async () => {
      await new Promise((r) => setTimeout(r, 20));
      return { source: 'legifrance', state: 'ok' };
    };
    const judilibre: SourceProbe = async () => ({ source: 'judilibre', state: 'ok' });
    const report = await getStatus({ config: configured, probes: { judilibre, legifrance } });
    expect(report.sources.map((s) => s.source)).toEqual(['legifrance', 'judilibre']);
  });

  it('isolates a throwing probe', async () => {
    const legifrance: SourceProbe = async () => {
      throw new Error('boom');
    };
    const ok: SourceHealth = { source: 'judilibre', state: 'ok' };
    const report = await getStatus({
      config: configured,
      probes: { legifrance, judilibre: async () => ok },
    });
    expect(report.sources).toEqual([
      { source: 'legifrance', state: 'unavailable', detail: 'boom' },
      ok,
    ]);
  });

  it('stringifies non-Error throws', async () => {
    const judilibre: SourceProbe = () => Promise.reject('plain');
    const report = await getStatus({ config: configured, probes: { judilibre } });
    expect(report.sources).toEqual([
      { source: 'judilibre', state: 'unavailable', detail: 'plain' },
    ]);
  });
});
