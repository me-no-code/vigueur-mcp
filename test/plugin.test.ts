import { readFileSync } from 'node:fs';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import { compose } from '../src/compose.js';
import { loadConfig } from '../src/config.js';
import { createServer } from '../src/server.js';

const readJson = (path: string) =>
  JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));

const plugin = readJson('.claude-plugin/plugin.json');
const marketplace = readJson('.claude-plugin/marketplace.json');
const pkg = readJson('package.json');

// Claude Code exposes plugin tools as mcp__plugin_<plugin>_<server>__<tool>;
// the Claude API rejects tool names longer than 64 characters.
const PLUGIN_TOOL_PREFIX = 'mcp__plugin_vigueur_vigueur__';
const MAX_TOOL_NAME = 64;

describe('Claude Code plugin manifest', () => {
  it('is named vigueur and tracks the package version', () => {
    expect(plugin.name).toBe('vigueur');
    expect(plugin.version).toBe(pkg.version);
    expect(plugin.license).toBe('PolyForm-Shield-1.0.0');
  });

  it('runs the built server with the PISTE variables the config reads', () => {
    const server = plugin.mcpServers.vigueur;
    expect(server.command).toBe('node');
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal placeholder Claude Code substitutes
    expect(server.args).toEqual(['${CLAUDE_PLUGIN_ROOT}/dist/index.js']);
    expect(Object.keys(server.env).sort()).toEqual([
      'PISTE_CLIENT_ID',
      'PISTE_CLIENT_SECRET',
      'PISTE_ENV',
    ]);
  });

  it('sends a user without a PISTE account to the docs', () => {
    expect(plugin.userConfig.piste_client_id.description).toBe(
      'OAuth client ID of your PISTE application (free account on https://piste.gouv.fr). No account yet? See https://github.com/me-no-code/vigueur-mcp/blob/main/user-docs/en/10-setup/01-piste-account.md',
    );
  });

  it('only references declared user_config options', () => {
    const refs = [
      ...JSON.stringify(plugin.mcpServers).matchAll(/\$\{user_config\.([A-Za-z0-9_]+)\}/g),
    ].map((m) => m[1]);
    expect(refs.length).toBe(3);
    for (const key of refs) expect(plugin.userConfig).toHaveProperty(key as string);
  });

  it('stores the client secret in secure storage and offers the two PISTE environments', () => {
    expect(plugin.userConfig.piste_client_secret.sensitive).toBe(true);
    expect(plugin.userConfig.piste_client_id.sensitive).not.toBe(true);
    expect(plugin.userConfig.piste_env.options).toEqual(['production', 'sandbox']);
    expect(plugin.userConfig.piste_env.default).toBe('production');
  });
});

describe('local marketplace', () => {
  it('lists the plugin at the repository root', () => {
    expect(marketplace.name).toBe('vigueur');
    expect(marketplace.plugins).toEqual([
      expect.objectContaining({ name: 'vigueur', source: './' }),
    ]);
  });
});

describe('tool names', () => {
  it(`fit the API limit once Claude Code prefixes them (${PLUGIN_TOOL_PREFIX}…)`, async () => {
    const deps = compose(
      loadConfig({ PISTE_CLIENT_ID: 'id', PISTE_CLIENT_SECRET: 'secret', PISTE_ENV: 'sandbox' }),
    );
    const handler = createMcpHandler(() => createServer(deps));
    const client = new Client(
      { name: 'test-harness', version: '1.0.0' },
      { versionNegotiation: { mode: 'auto' } },
    );
    try {
      await client.connect(
        new StreamableHTTPClientTransport(new URL('http://test.local/mcp'), {
          fetch: (url, init) => handler.fetch(new Request(url, init)),
        }),
      );
      const { tools } = await client.listTools();
      expect(tools.length).toBeGreaterThan(0);
      for (const tool of tools) {
        expect(`${PLUGIN_TOOL_PREFIX}${tool.name}`.length, tool.name).toBeLessThanOrEqual(
          MAX_TOOL_NAME,
        );
      }
    } finally {
      await client.close();
      await handler.close();
    }
  });
});
