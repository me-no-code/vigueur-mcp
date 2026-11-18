import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';
import type { StatusContext, StatusReport } from '../../src/services/status.js';
import { toolContext } from '../../src/tools/envelope.js';
import { expectAnswer, expectToolError } from '../helpers/answer.js';
import { connectClient } from '../helpers/mcp-client.js';

const unconfigured: StatusReport = {
  configured: false,
  env: null,
  configProblems: [],
  sources: [],
};

const allOk: StatusReport = {
  configured: true,
  env: 'sandbox',
  sources: [
    { source: 'legifrance', state: 'ok' },
    { source: 'judilibre', state: 'ok' },
  ],
};

const NOW = new Date('2026-11-16T10:20:30.456Z');

let cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of cleanup.reverse()) await close();
  cleanup = [];
});

/** Calls vigueur_status on a server whose status service answers `getStatus`. */
async function callStatus(getStatus: (ctx?: StatusContext) => Promise<StatusReport>) {
  const { client, close } = await connectClient({
    config: loadConfig({}),
    getStatus,
    sources: [],
    tools: toolContext({ now: () => NOW }),
  });
  cleanup.push(close);
  return client.callTool({ name: 'vigueur_status' });
}

const report = (r: StatusReport) => async () => r;

describe('vigueur_status', () => {
  it('unconfigured: not_configured, facts only', async () => {
    const a = expectAnswer(await callStatus(report(unconfigured)), {
      source: 'PISTE',
      outcome: 'not_configured',
    });
    expect(a.config_problems).toEqual([]);
    expect(a.warnings).toEqual([]);
    expect(a.request).toEqual({ tool: 'vigueur_status' });
    expect(a.retrieved).toBe('2026-11-16T10:20:30Z');
    // Setting Vigueur up is the install's business (the bundle, the README, the docs).
    expect(Object.keys(a).sort()).toEqual([
      'cached',
      'config_problems',
      'outcome',
      'request',
      'retrieved',
      'source',
      'vigueur_version',
      'warnings',
    ]);
  });

  it('shows config problems verbatim', async () => {
    const problems = [
      'PISTE_CLIENT_SECRET is missing (PISTE_CLIENT_ID is set)',
      'PISTE_ENV must be "production" or "sandbox" (got "prod")',
    ];
    const a = expectAnswer(
      await callStatus(report({ ...unconfigured, configProblems: problems })),
      {
        source: 'PISTE',
        outcome: 'not_configured',
      },
    );
    expect(a.config_problems).toEqual(problems);
  });

  it('all sources ok: environment and one check per source, no warnings', async () => {
    const a = expectAnswer(await callStatus(report(allOk)), {
      source: 'PISTE',
      outcome: 'results',
    });
    expect(a.environment).toBe('sandbox');
    expect(a.checks).toEqual([
      { source: 'Légifrance', state: 'ok', detail: null, retry_after_seconds: null },
      { source: 'Judilibre', state: 'ok', detail: null, retry_after_seconds: null },
    ]);
    expect(a.warnings).toEqual([]);
    expect(Object.keys(a).sort()).toEqual([
      'cached',
      'checks',
      'environment',
      'outcome',
      'request',
      'retrieved',
      'source',
      'vigueur_version',
      'warnings',
    ]);
  });

  it('a source not enabled: marks it, without advice', async () => {
    const a = expectAnswer(
      await callStatus(
        report({
          ...allOk,
          sources: [
            { source: 'legifrance', state: 'ok' },
            { source: 'judilibre', state: 'not_enabled' },
          ],
        }),
      ),
      { source: 'PISTE', outcome: 'results' },
    );
    expect(a.checks[0].state).toBe('ok');
    expect(a.checks[1].state).toBe('not_enabled');
    expect(a.warnings).toEqual([]);
  });

  it('an unexpected answer: marks the source with what PISTE answered', async () => {
    const a = expectAnswer(
      await callStatus(
        report({
          ...allOk,
          sources: [
            {
              source: 'legifrance',
              state: 'unexpected_response',
              detail: 'Légifrance: not found (HTTP 404)',
            },
            { source: 'judilibre', state: 'ok' },
          ],
        }),
      ),
      { source: 'PISTE', outcome: 'results' },
    );
    expect(a.checks[0]).toEqual({
      source: 'Légifrance',
      state: 'unexpected_response',
      detail: 'not found (HTTP 404)',
      retry_after_seconds: null,
    });
    expect(a.warnings).toEqual([]);
  });

  it('credentials rejected: marks each source, without advice', async () => {
    const a = expectAnswer(
      await callStatus(
        report({
          ...allOk,
          env: 'production',
          sources: [
            { source: 'legifrance', state: 'credentials_invalid' },
            { source: 'judilibre', state: 'credentials_invalid' },
          ],
        }),
      ),
      { source: 'PISTE', outcome: 'results' },
    );
    expect(a.environment).toBe('production');
    expect(a.checks[0].state).toBe('credentials_invalid');
    expect(a.checks[1].state).toBe('credentials_invalid');
    expect(a.warnings).toEqual([]);
  });

  it('a failing probe: its state and detail, without the doubled source label', async () => {
    const a = expectAnswer(
      await callStatus(
        report({
          ...allOk,
          sources: [
            {
              source: 'legifrance',
              state: 'unavailable',
              detail: 'Légifrance: service error (HTTP 503)',
            },
            {
              source: 'judilibre',
              state: 'unavailable',
              detail: 'Judilibre: service error (HTTP 500)',
            },
          ],
        }),
      ),
      { source: 'PISTE', outcome: 'results' },
    );
    expect(a.checks[0]).toEqual({
      source: 'Légifrance',
      state: 'unavailable',
      detail: 'service error (HTTP 503)',
      retry_after_seconds: null,
    });
    expect(a.checks[1].detail).toBe('service error (HTTP 500)');
    expect(a.warnings).toEqual([]);
  });

  it('a quota_exceeded source: carries the retry delay', async () => {
    const a = expectAnswer(
      await callStatus(
        report({
          ...allOk,
          sources: [
            { source: 'legifrance', state: 'quota_exceeded', retryAfterSeconds: 30 },
            { source: 'judilibre', state: 'ok' },
          ],
        }),
      ),
      { source: 'PISTE', outcome: 'results' },
    );
    expect(a.checks[0]).toEqual({
      source: 'Légifrance',
      state: 'quota_exceeded',
      detail: null,
      retry_after_seconds: 30,
    });
  });

  it('a status service that throws: an unexpected error naming PISTE', async () => {
    const e = expectToolError(
      await callStatus(async () => {
        throw new Error('boom');
      }),
      'unexpected',
    );
    expect(e.source).toBe('PISTE');
    expect(e.request).toEqual({ tool: 'vigueur_status' });
    expect(e.error.message).toContain('boom');
  });
});
