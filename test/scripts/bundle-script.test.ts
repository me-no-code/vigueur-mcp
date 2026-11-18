import { afterEach, describe, expect, it, vi } from 'vitest';

const SCRIPT = new URL('../../scripts/bundle.mjs', import.meta.url).href;

afterEach(() => {
  vi.unstubAllEnvs();
});

// In this process, not a child Node: the guard reads only `npm_execpath`, and a child's start-up
// under the full parallel suite has taken longer than the test timeout.
describe('scripts/bundle.mjs refuses to run outside npm, before touching anything', () => {
  it.each([
    ['unset', undefined],
    ['pnpm', '/usr/local/lib/node_modules/pnpm/bin/pnpm.cjs'],
    ['yarn', '/usr/local/lib/node_modules/yarn/bin/yarn.js'],
  ])('npm_execpath %s', async (name, execPath) => {
    vi.stubEnv('npm_execpath', execPath);
    // One query string per case, so each import runs the script's top level afresh.
    await expect(import(`${SCRIPT}?npm_execpath=${name}`)).rejects.toThrow(
      'run this script with `npm run bundle`',
    );
  });
});
