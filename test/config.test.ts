import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

const ID = 'id-123';
const SECRET = 'secret-456';

describe('loadConfig', () => {
  it('is unconfigured with no problems when nothing is set', () => {
    expect(loadConfig({})).toEqual({ piste: null, problems: [] });
  });
  it('defaults env to production', () => {
    expect(loadConfig({ PISTE_CLIENT_ID: ID, PISTE_CLIENT_SECRET: SECRET }).piste).toEqual({
      clientId: ID,
      clientSecret: SECRET,
      env: 'production',
    });
  });
  it('accepts sandbox case-insensitively', () => {
    expect(
      loadConfig({ PISTE_CLIENT_ID: ID, PISTE_CLIENT_SECRET: SECRET, PISTE_ENV: 'SANDBOX' }).piste
        ?.env,
    ).toBe('sandbox');
  });
  it('reports a missing secret', () => {
    expect(loadConfig({ PISTE_CLIENT_ID: ID })).toEqual({
      piste: null,
      problems: ['PISTE_CLIENT_SECRET is missing (PISTE_CLIENT_ID is set)'],
    });
  });
  it('reports a missing id', () => {
    expect(loadConfig({ PISTE_CLIENT_SECRET: SECRET })).toEqual({
      piste: null,
      problems: ['PISTE_CLIENT_ID is missing (PISTE_CLIENT_SECRET is set)'],
    });
  });
  it('rejects an unknown env', () => {
    expect(
      loadConfig({ PISTE_CLIENT_ID: ID, PISTE_CLIENT_SECRET: SECRET, PISTE_ENV: 'prod' }),
    ).toEqual({
      piste: null,
      problems: ['PISTE_ENV must be "production" or "sandbox" (got "prod")'],
    });
  });
  it('does not echo an env value that may be a pasted secret', () => {
    const value = 'secret-456-xyz-0123456789abcdef';
    const { problems } = loadConfig({
      PISTE_CLIENT_ID: ID,
      PISTE_CLIENT_SECRET: SECRET,
      PISTE_ENV: value,
    });
    expect(problems.join(' ')).not.toContain(value);
    expect(problems.join(' ')).toContain('unrecognised value');
  });
  it('trims whitespace and one pair of surrounding quotes', () => {
    expect(
      loadConfig({ PISTE_CLIENT_ID: '  "id-123"\n', PISTE_CLIENT_SECRET: "'secret-456' " }).piste,
    ).toEqual({ clientId: ID, clientSecret: SECRET, env: 'production' });
  });
  it('treats blank values as unset', () => {
    expect(loadConfig({ PISTE_CLIENT_ID: '  ', PISTE_CLIENT_SECRET: '' })).toEqual({
      piste: null,
      problems: [],
    });
  });
  it('never puts credential values in problems', () => {
    expect(loadConfig({ PISTE_CLIENT_SECRET: SECRET }).problems.join(' ')).not.toContain(SECRET);
  });
});

describe('PISTE_PRODUCTION (a yes/no for the environment, e.g. a switch)', () => {
  const ids = { PISTE_CLIENT_ID: ID, PISTE_CLIENT_SECRET: SECRET };
  it('true or unset means production, false means sandbox, in any case', () => {
    expect(loadConfig({ ...ids, PISTE_PRODUCTION: 'true' }).piste?.env).toBe('production');
    expect(loadConfig({ ...ids, PISTE_PRODUCTION: 'FALSE' }).piste?.env).toBe('sandbox');
    expect(loadConfig({ ...ids }).piste?.env).toBe('production');
  });
  it('rejects a value other than true or false', () => {
    expect(loadConfig({ ...ids, PISTE_PRODUCTION: 'yes' })).toEqual({
      piste: null,
      problems: ['PISTE_PRODUCTION must be "true" or "false" (got "yes")'],
    });
  });
  it('reports PISTE_ENV and PISTE_PRODUCTION that disagree, without picking one', () => {
    expect(loadConfig({ ...ids, PISTE_ENV: 'sandbox', PISTE_PRODUCTION: 'true' })).toEqual({
      piste: null,
      problems: ['PISTE_ENV is "sandbox" but PISTE_PRODUCTION is "true": set only one'],
    });
  });
  it('accepts PISTE_ENV and PISTE_PRODUCTION that agree', () => {
    expect(loadConfig({ ...ids, PISTE_ENV: 'sandbox', PISTE_PRODUCTION: 'false' })).toEqual({
      piste: { clientId: ID, clientSecret: SECRET, env: 'sandbox' },
      problems: [],
    });
  });
});

describe('settings the app left unfilled', () => {
  it('treats unfilled user_config placeholders as unset', () => {
    expect(
      loadConfig({
        // biome-ignore lint/suspicious/noTemplateCurlyInString: an unfilled placeholder, as an app passes it
        PISTE_CLIENT_ID: '${user_config.piste_client_id}',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: an unfilled placeholder, as an app passes it
        PISTE_CLIENT_SECRET: '${user_config.piste_client_secret}',
      }),
    ).toEqual({ piste: null, problems: [] });
  });
  it('an unfilled PISTE_PRODUCTION placeholder means production', () => {
    expect(
      loadConfig({
        PISTE_CLIENT_ID: ID,
        PISTE_CLIENT_SECRET: SECRET,
        // biome-ignore lint/suspicious/noTemplateCurlyInString: an unfilled placeholder, as an app passes it
        PISTE_PRODUCTION: '${user_config.piste_production}',
      }).piste?.env,
    ).toBe('production');
  });
});
