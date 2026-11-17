// Packs the Claude Desktop bundle, build/vigueur-<version>.mcpb: a fresh build of the same server
// the Claude Code plugin runs, its production dependencies, and mcpb/manifest.json.
// Files are copied by explicit list into build/mcpb, never by globbing the repository, so nothing
// private (.env, notes) can end up in the bundle.
// npm and mcpb run through Node itself, not their shell shims: on Windows the shims are .cmd
// files, which Node does not spawn without a shell. Run this with `npm run bundle`, which sets
// npm_execpath.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const stage = join(root, 'build', 'mcpb');
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const runNode = (script, args, cwd = root) =>
  execFileSync(process.execPath, [script, ...args], { cwd, stdio: 'inherit' });

const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('npm_execpath is unset: run this script with `npm run bundle`.');
const mcpbPackage = join(root, 'node_modules', '@anthropic-ai', 'mcpb');
const mcpbBin = readJson(join(mcpbPackage, 'package.json')).bin;
const mcpbCli = join(mcpbPackage, typeof mcpbBin === 'string' ? mcpbBin : mcpbBin.mcpb);

const { version } = readJson(join(root, 'package.json'));
const output = join(root, 'build', `vigueur-${version}.mcpb`);

// A clean build: tsc never deletes the output of a source file that no longer exists.
rmSync(join(root, 'dist'), { recursive: true, force: true });
runNode(npmCli, ['run', 'build']);

rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
cpSync(join(root, 'mcpb', 'manifest.json'), join(stage, 'manifest.json'));
for (const file of ['package.json', 'package-lock.json', 'LICENSE']) {
  cpSync(join(root, file), join(stage, file));
}
cpSync(join(root, 'dist'), join(stage, 'dist'), { recursive: true });
runNode(npmCli, ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], stage);

rmSync(output, { force: true });
runNode(mcpbCli, ['pack', stage, output]);
console.log(`${output} (${Math.round(statSync(output).size / 1024)} KB)`);
