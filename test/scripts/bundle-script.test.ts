import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

/** Runs scripts/bundle.mjs with `npm_execpath` set to `execPath` (or unset). */
function bundleWith(execPath: string | undefined) {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && key !== 'npm_execpath') env[key] = value;
  }
  if (execPath !== undefined) env.npm_execpath = execPath;
  return spawnSync(process.execPath, ['scripts/bundle.mjs'], { cwd: ROOT, env, encoding: 'utf8' });
}

describe('scripts/bundle.mjs refuses to run outside npm, before touching anything', () => {
  it.each([
    ['unset', undefined],
    ['pnpm', '/usr/local/lib/node_modules/pnpm/bin/pnpm.cjs'],
    ['yarn', '/usr/local/lib/node_modules/yarn/bin/yarn.js'],
  ])('npm_execpath %s', (_name, execPath) => {
    const run = bundleWith(execPath);
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain('run this script with `npm run bundle`');
  });
});
