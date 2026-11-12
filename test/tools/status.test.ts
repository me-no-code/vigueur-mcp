import { describe, expect, it } from 'vitest';
import type { StatusReport } from '../../src/services/status.js';
import { formatStatus } from '../../src/tools/status.js';

const unconfigured: StatusReport = {
  configured: false,
  env: null,
  configProblems: [],
  sources: [],
};

const allOk: StatusReport = {
  configured: true,
  env: 'sandbox',
  configProblems: [],
  sources: [
    { source: 'legifrance', state: 'ok' },
    { source: 'judilibre', state: 'ok' },
  ],
};

describe('formatStatus', () => {
  it('unconfigured: returns the PISTE setup guide', () => {
    const text = formatStatus(unconfigured);
    for (const expected of [
      'PISTE_CLIENT_ID',
      'PISTE_CLIENT_SECRET',
      'PISTE_ENV',
      'piste.gouv.fr',
      'Validate my ToS choices',
      'Apply changes',
    ]) {
      expect(text).toContain(expected);
    }
  });

  it('configured, all sources ok: environment and one line per source, no setup steps', () => {
    const text = formatStatus(allOk);
    expect(text).toContain('Environment: sandbox');
    expect(text).toContain('✅ Légifrance: ok');
    expect(text).toContain('✅ Judilibre: ok');
    expect(text).not.toContain('Validate my ToS choices');
    expect(text).not.toContain('Sandbox credentials only work');
  });

  it('a source not enabled: marks it and gives the consent/apply steps', () => {
    const text = formatStatus({
      ...allOk,
      sources: [
        { source: 'legifrance', state: 'ok' },
        { source: 'judilibre', state: 'not_enabled' },
      ],
    });
    expect(text).toContain('✅ Légifrance: ok');
    expect(text).toContain('❌ Judilibre: not_enabled');
    expect(text).toContain('Validate my ToS choices');
    expect(text).toContain('Apply changes');
  });

  it('credentials rejected: explains the sandbox/production pairing', () => {
    const text = formatStatus({
      ...allOk,
      env: 'production',
      sources: [
        { source: 'legifrance', state: 'credentials_invalid' },
        { source: 'judilibre', state: 'credentials_invalid' },
      ],
    });
    expect(text).toContain('Environment: production');
    expect(text).toContain('❌ Légifrance: credentials_invalid');
    expect(text).toContain(
      'Sandbox credentials only work with PISTE_ENV=sandbox, production credentials with PISTE_ENV=production.',
    );
  });

  it('shows the failure detail after the state', () => {
    const text = formatStatus({
      ...allOk,
      sources: [
        {
          source: 'legifrance',
          state: 'unavailable',
          detail: 'Légifrance: service error (HTTP 503)',
        },
        { source: 'judilibre', state: 'ok' },
      ],
    });
    expect(text).toContain('❌ Légifrance: unavailable — service error (HTTP 503)');
  });

  it('shows the retry delay for a quota_exceeded source', () => {
    const text = formatStatus({
      ...allOk,
      sources: [
        { source: 'legifrance', state: 'quota_exceeded', retryAfterSeconds: 30 },
        { source: 'judilibre', state: 'ok' },
      ],
    });
    expect(text).toContain('Retry in about 30 s');
  });

  it('does not double the source label in the detail', () => {
    const text = formatStatus({
      ...allOk,
      sources: [
        { source: 'legifrance', state: 'ok' },
        {
          source: 'judilibre',
          state: 'unavailable',
          detail: 'Judilibre: service error (HTTP 500)',
        },
      ],
    });
    expect(text).toContain('❌ Judilibre: unavailable — service error (HTTP 500)');
    expect(text).not.toContain('Judilibre: Judilibre');
  });

  it('an unavailable source: says PISTE did not answer', () => {
    const text = formatStatus({
      ...allOk,
      sources: [
        { source: 'legifrance', state: 'unavailable' },
        { source: 'judilibre', state: 'ok' },
      ],
    });
    expect(text).toContain('PISTE did not answer; try again in a moment');
  });

  it('shows config problems verbatim alongside the setup guide', () => {
    const problems = [
      'PISTE_CLIENT_SECRET is missing (PISTE_CLIENT_ID is set)',
      'PISTE_ENV must be "production" or "sandbox" (got "prod")',
    ];
    const text = formatStatus({ ...unconfigured, configProblems: problems });
    for (const problem of problems) expect(text).toContain(problem);
    expect(text).toContain('piste.gouv.fr');
  });
});
