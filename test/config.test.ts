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
