import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compose } from '../src/compose.js';
import { loadConfig } from '../src/config.js';
import { VERSION } from '../src/version.js';
import { connectClient } from './helpers/mcp-client.js';

/**
 * The Claude Desktop bundle's manifest (`mcpb/manifest.json`, MCPB manifest 0.3). It runs the same
 * built server as the Claude Code plugin and carries Desktop's own wording; the server knows no app.
 */

const readJson = (path: string) =>
  JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));

const MANIFEST_PATH = 'mcpb/manifest.json';
const manifest = existsSync(new URL(`../${MANIFEST_PATH}`, import.meta.url))
  ? readJson(MANIFEST_PATH)
  : {};
const plugin = readJson('.claude-plugin/plugin.json');
const pkg = readJson('package.json');

const REPO = 'https://github.com/me-no-code/vigueur-mcp';

describe('Claude Desktop bundle manifest', () => {
  it('is MCPB 0.3, named vigueur, at the package version', () => {
    expect(manifest.manifest_version).toBe('0.3');
    expect(manifest.name).toBe('vigueur');
    expect(manifest.display_name).toBe('Vigueur');
    expect(manifest.version).toBe(pkg.version);
    expect(manifest.version).toBe(plugin.version);
    expect(manifest.version).toBe(VERSION);
    expect(manifest.description).toBe(plugin.description);
    expect(manifest.license).toBe('PolyForm-Shield-1.0.0');
    expect(manifest.author).toEqual({ name: 'Vigueur contributors' });
    expect(manifest.repository).toEqual({ type: 'git', url: REPO });
    expect(manifest.homepage).toBe(REPO);
    expect(manifest.documentation).toBe(`${REPO}/tree/main/user-docs`);
    // Desktop's link next to the extension's name opens `support`: the repo, not its issues.
    expect(manifest.support).toBe(REPO);
  });

  it('runs the built server with Node', () => {
    expect(manifest.server.type).toBe('node');
    expect(manifest.server.entry_point).toBe('dist/index.js');
    expect(manifest.server.mcp_config.command).toBe('node');
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal placeholder Claude Desktop substitutes
    expect(manifest.server.mcp_config.args).toEqual(['${__dirname}/dist/index.js']);
  });

  it('passes the PISTE settings', () => {
    const env = manifest.server.mcp_config.env;
    expect(Object.keys(env).sort()).toEqual([
      'PISTE_CLIENT_ID',
      'PISTE_CLIENT_SECRET',
      'PISTE_PRODUCTION',
    ]);
    const refs = [...JSON.stringify(env).matchAll(/\$\{user_config\.([A-Za-z0-9_]+)\}/g)].map(
      (m) => m[1],
    );
    expect(refs.sort()).toEqual(['piste_client_id', 'piste_client_secret', 'piste_production']);
  });

  it('asks for the same credentials as the plugin, the environment as a switch, none required', () => {
    const fields = manifest.user_config;
    expect(Object.keys(fields).sort()).toEqual([
      'piste_client_id',
      'piste_client_secret',
      'piste_production',
    ]);
    for (const key of ['piste_client_id', 'piste_client_secret']) {
      expect(fields[key].type, key).toBe('string');
      expect(fields[key].title, key).toBe(plugin.userConfig[key].title);
      expect(fields[key].description, key).toBe(plugin.userConfig[key].description);
    }
    expect(fields.piste_client_secret.sensitive).toBe(true);
    expect(fields.piste_client_id.sensitive).not.toBe(true);
    expect(fields.piste_production).toEqual({
      type: 'boolean',
      title: 'Production application',
      description:
        'On for an application you created on PISTE (production); turn it off for the sandbox application PISTE creates automatically.',
      default: true,
    });
    for (const [key, field] of Object.entries(fields)) {
      expect((field as { required?: boolean }).required, key).not.toBe(true);
    }
  });

  it('targets macOS and Windows with Node 20 or later, and links the privacy page', () => {
    expect(manifest.compatibility).toEqual({
      platforms: ['darwin', 'win32'],
      runtimes: { node: '>=20' },
    });
    expect(manifest.privacy_policies).toEqual([
      `${REPO}/blob/main/user-docs/en/00-intro/04-privacy-and-your-data.md`,
    ]);
  });

  it('lists exactly the tools a configured server registers, each with a one-line description', async () => {
    const { client, close } = await connectClient(
      compose(
        loadConfig({ PISTE_CLIENT_ID: 'id', PISTE_CLIENT_SECRET: 'secret', PISTE_ENV: 'sandbox' }),
      ),
    );
    try {
      const { tools } = await client.listTools();
      const listed = (manifest.tools ?? []) as Array<{ name: string; description: string }>;
      expect(listed.map((t) => t.name).sort()).toEqual(tools.map((t) => t.name).sort());
      for (const tool of listed) {
        expect(tool.description, tool.name).toMatch(/^\S.{10,120}$/);
      }
    } finally {
      await close();
    }
  });
});
