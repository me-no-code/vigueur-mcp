import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Opt-in (`npm run test:bundle`): packs the Claude Desktop bundle with `scripts/bundle.mjs`, then
// unpacks it and starts Vigueur from it, as Claude Desktop would. Packing installs the production
// dependencies, so it needs the npm registry or npm's cache.
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const VERSION = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version as string;
const BUNDLE = join(ROOT, 'build', `vigueur-${VERSION}.mcpb`);
const MCPB_PACKAGE = join(ROOT, 'node_modules', '@anthropic-ai', 'mcpb');
const MCPB_BIN = JSON.parse(readFileSync(join(MCPB_PACKAGE, 'package.json'), 'utf8')).bin as
  | string
  | Record<string, string>;
const MCPB_CLI = join(
  MCPB_PACKAGE,
  typeof MCPB_BIN === 'string' ? MCPB_BIN : (MCPB_BIN.mcpb ?? ''),
);

/** Runs the mcpb CLI through Node, as on Windows, where its shell shim cannot be spawned directly. */
const mcpb = (args: string[]) =>
  execFileSync(process.execPath, [MCPB_CLI, ...args], { stdio: 'pipe' });

/** Every file under `dir`, as a path relative to it with forward slashes. */
function filesUnder(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => relative(dir, join(e.parentPath, e.name)).split('\\').join('/'));
}

/** The test environment without any PISTE_* or VIGUEUR_* variable, plus `extra`. */
function envWith(extra: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !key.startsWith('PISTE_') && !key.startsWith('VIGUEUR_')) {
      env[key] = value;
    }
  }
  return { ...env, ...extra };
}

describe.skipIf(!process.env.VIGUEUR_BUNDLE)('Claude Desktop bundle', () => {
  let dir = '';

  beforeAll(() => {
    // Pack with only `node` runnable: no npm or mcpb shim on PATH. On Windows those shims are .cmd
    // files, which Node does not spawn without a shell, so the script must run both through Node.
    const npmCli = process.env.npm_execpath;
    expect(npmCli, 'npm_execpath unset: run npm run test:bundle').toBeTruthy();
    const nodeOnly = mkdtempSync(join(tmpdir(), 'vigueur-node-only-'));
    symlinkSync(process.execPath, join(nodeOnly, 'node'));
    try {
      execFileSync(process.execPath, [join(ROOT, 'scripts', 'bundle.mjs')], {
        cwd: ROOT,
        env: envWith({
          PATH: [nodeOnly, '/usr/bin', '/bin'].join(':'),
          npm_execpath: npmCli ?? '',
        }),
        stdio: 'pipe',
      });
    } finally {
      rmSync(nodeOnly, { recursive: true, force: true });
    }
    expect(existsSync(BUNDLE), `${BUNDLE} missing after packing`).toBe(true);
    dir = mkdtempSync(join(tmpdir(), 'vigueur-bundle-'));
    mcpb(['unpack', BUNDLE, dir]);
  }, 300_000);

  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('holds a valid manifest, the built server and its runtime libraries', () => {
    mcpb(['validate', join(dir, 'manifest.json')]);
    const files = filesUnder(dir);
    for (const needed of [
      'manifest.json',
      'LICENSE',
      'dist/index.js',
      'node_modules/@modelcontextprotocol/server/package.json',
      'node_modules/zod/package.json',
    ]) {
      expect(files, needed).toContain(needed);
    }
  });

  it('holds exactly the runtime packages the lockfile lists, no development tool', () => {
    const lock = JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8')) as {
      packages: Record<string, { dev?: boolean; devOptional?: boolean }>;
    };
    const runtime = Object.entries(lock.packages)
      .filter(([path, p]) => path.startsWith('node_modules/') && !p.dev && !p.devOptional)
      .map(([path]) => path)
      .sort();
    const shipped = [...new Set(filesUnder(dir).filter((f) => f.endsWith('/package.json')))]
      .map((f) => f.slice(0, -'/package.json'.length))
      .filter((path) => /^node_modules\/(@[^/]+\/)?[^/@]+$/.test(path))
      .sort();
    expect(shipped).toEqual(runtime);
  });

  it('holds no private file, source, test, doc or development tool', () => {
    const forbidden = [
      '.env',
      'src/',
      'test/',
      'docs/',
      'user-docs/',
      '.git/',
      'node_modules/vitest/',
      'node_modules/typescript/',
      'node_modules/@biomejs/',
      'node_modules/@anthropic-ai/mcpb/',
    ];
    const leaks = filesUnder(dir).filter((f) => forbidden.some((bad) => f.startsWith(bad)));
    expect(leaks).toEqual([]);
  });

  async function start(env: Record<string, string>) {
    const client = new Client({ name: 'bundle-test', version: '1.0.0' });
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [join(dir, 'dist', 'index.js')],
        env: envWith(env),
        stderr: 'pipe',
      }),
    );
    return client;
  }

  it('starts without credentials: vigueur_status only, answering not_configured', async () => {
    const client = await start({});
    try {
      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name)).toEqual(['vigueur_status']);
      const result = await client.callTool({ name: 'vigueur_status' });
      expect((result.structuredContent as { outcome: string }).outcome).toBe('not_configured');
    } finally {
      await client.close();
    }
  }, 30_000);

  it('starts with the switch settings: all 14 tools', async () => {
    const client = await start({
      PISTE_CLIENT_ID: 'id',
      PISTE_CLIENT_SECRET: 'secret',
      PISTE_PRODUCTION: 'false',
    });
    try {
      const { tools } = await client.listTools();
      expect(tools).toHaveLength(14);
    } finally {
      await client.close();
    }
  }, 30_000);
});
