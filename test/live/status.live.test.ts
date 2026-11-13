import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { describe, expect, it } from 'vitest';

// Opt-in (`npm run test:live`): talks to PISTE with the credentials in `.env`.
// Spawns the built entry point: run `npm run build` first.
const ENTRY = fileURLToPath(new URL('../../dist/index.js', import.meta.url));
const ENV_FILE = fileURLToPath(new URL('../../.env', import.meta.url));

describe.skipIf(!process.env.VIGUEUR_LIVE)('vigueur_status against PISTE (live)', () => {
  it('reports every source reachable and enabled', async () => {
    process.loadEnvFile(ENV_FILE);
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) env[key] = value;
    }

    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [ENTRY],
      env,
      stderr: 'pipe',
    });
    const client = new Client({ name: 'live-test', version: '1.0.0' });
    await client.connect(transport);
    try {
      const result = await client.callTool({ name: 'vigueur_status' });
      const [first] = result.content as Array<{ type: string; text?: string }>;
      const statusText = first?.text ?? '';

      expect(result.isError, statusText).toBeFalsy();
      expect(statusText, statusText).toContain('Environment:');
      expect(statusText, statusText).toContain('✅ Légifrance: ok');
      expect(statusText, statusText).not.toContain('❌');
    } finally {
      await client.close();
    }
  }, 30_000);
});
