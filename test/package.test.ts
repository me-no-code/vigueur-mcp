import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The npm package, as `npm publish` would send it: the built server and the licence files. No
 * source, test, fixture or private file, and no file for one app. `npm test` builds `dist/` first.
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

// Through the shell, so that `npm` resolves on every system (npm.cmd on Windows). Offline: a dry
// run lists the files without talking to the registry.
const packed: { name: string; files: { path: string }[] } = JSON.parse(
  execSync('npm pack --dry-run --json --ignore-scripts', {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }),
)[0];
const files = packed.files.map((f) => f.path).sort();

const ALLOWED = [
  /^dist\/.+\.js$/,
  /^dist\/.+\.js\.map$/,
  /^(LICENSE|NOTICE|README\.md|package\.json)$/,
];

describe('npm package', () => {
  it('is public, named vigueur-mcp, with the vigueur-mcp command', () => {
    expect(pkg.private).toBeUndefined();
    expect(packed.name).toBe('vigueur-mcp');
    expect(pkg.bin).toEqual({ 'vigueur-mcp': 'dist/index.js' });
  });

  it('names the GitHub repository, which npm trusted publishing and provenance check', () => {
    expect(pkg.repository).toEqual({
      type: 'git',
      url: 'git+https://github.com/me-no-code/vigueur-mcp.git',
    });
  });

  it('holds the server and the licence files', () => {
    for (const path of ['dist/index.js', 'LICENSE', 'NOTICE', 'README.md', 'package.json']) {
      expect(files).toContain(path);
    }
  });

  it('holds nothing else', () => {
    expect(files.filter((path) => !ALLOWED.some((pattern) => pattern.test(path)))).toEqual([]);
  });
});
