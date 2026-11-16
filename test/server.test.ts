import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type { McpHttpHandler } from '@modelcontextprotocol/server';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { afterEach, describe, expect, it } from 'vitest';
import type { Config } from '../src/config.js';
import type { ServerDeps } from '../src/server.js';
import { createServer } from '../src/server.js';
import type { StatusReport } from '../src/services/status.js';
import { VigueurError } from '../src/shared/errors.js';
import type { SourceModule } from '../src/sources.js';
import { VERSION } from '../src/version.js';
import { expectAnswer } from './helpers/answer.js';

const unconfigured: Config = { piste: null, problems: [] };
const configured: Config = {
  piste: { clientId: 'id', clientSecret: 'secret', env: 'sandbox' },
  problems: [],
};

const unconfiguredReport: StatusReport = {
  configured: false,
  env: null,
  configProblems: [],
  sources: [],
};

const fakeSource: SourceModule = {
  id: 'legifrance',
  register(server) {
    server.registerTool('fake_echo', { description: 'Echo for tests' }, () => ({
      content: [{ type: 'text', text: 'echo' }],
    }));
  },
};

function deps(overrides: Partial<ServerDeps> = {}): ServerDeps {
  return {
    config: unconfigured,
    getStatus: async () => unconfiguredReport,
    sources: [],
    ...overrides,
  };
}

let cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const close of cleanup.reverse()) await close();
  cleanup = [];
});

async function connect(serverDeps: ServerDeps): Promise<Client> {
  const handler: McpHttpHandler = createMcpHandler(() => createServer(serverDeps));
  const transport = new StreamableHTTPClientTransport(new URL('http://test.local/mcp'), {
    fetch: (url, init) => handler.fetch(new Request(url, init)),
  });
  const client = new Client(
    { name: 'test-harness', version: '1.0.0' },
    { versionNegotiation: { mode: 'auto' } },
  );
  cleanup.push(() => handler.close());
  await client.connect(transport);
  cleanup.push(() => client.close());
  return client;
}

async function toolNames(client: Client): Promise<string[]> {
  const { tools } = await client.listTools();
  return tools.map((t) => t.name);
}

describe('createServer', () => {
  it('unconfigured: exposes only vigueur_status', async () => {
    const client = await connect(deps());
    expect(await toolNames(client)).toEqual(['vigueur_status']);
  });

  it('unconfigured: vigueur_status answers not_configured with the setup guide', async () => {
    const client = await connect(deps());
    const result = await client.callTool({ name: 'vigueur_status' });
    const a = expectAnswer(result, { source: 'PISTE', outcome: 'not_configured' });
    expect(a.setup_guide).toContain('PISTE_CLIENT_ID');
  });

  it('configured: registers source modules', async () => {
    const client = await connect(deps({ config: configured, sources: [fakeSource] }));
    const names = await toolNames(client);
    expect(names).toContain('vigueur_status');
    expect(names).toContain('fake_echo');
  });

  it('unconfigured: does not register source modules', async () => {
    const client = await connect(deps({ sources: [fakeSource] }));
    expect(await toolNames(client)).not.toContain('fake_echo');
  });

  it('vigueur_status carries the read-only annotations and a title', async () => {
    const client = await connect(deps());
    const { tools } = await client.listTools();
    const status = tools.find((t) => t.name === 'vigueur_status');
    expect(status?.title).toBe('Vigueur setup status');
    expect(status?.annotations).toEqual({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    });
  });

  it('vigueur_status reports a failing status check as a tool error', async () => {
    const client = await connect(
      deps({
        getStatus: () =>
          Promise.reject(new VigueurError('upstream_unavailable', 'PISTE is down for tests.')),
      }),
    );
    const result = await client.callTool({ name: 'vigueur_status' });
    expect(result.isError).toBe(true);
    const [first] = result.content as Array<{ type: string; text: string }>;
    expect(first?.text).toContain('PISTE is down for tests.');
  });

  it('identifies itself as vigueur with the package version', async () => {
    const client = await connect(deps());
    expect(client.getServerVersion()).toEqual({ name: 'vigueur', version: VERSION });
  });
});

describe('vigueur_status handler signal', () => {
  it('hands getStatus a live signal bounding the call', async () => {
    let seen: AbortSignal | undefined;
    let abortedDuringCall: boolean | undefined;
    const client = await connect(
      deps({
        getStatus: async (ctx) => {
          seen = ctx?.signal;
          abortedDuringCall = ctx?.signal?.aborted;
          return unconfiguredReport;
        },
      }),
    );
    await client.callTool({ name: 'vigueur_status', arguments: {} });
    expect(seen).toBeInstanceOf(AbortSignal);
    expect(abortedDuringCall).toBe(false);
  });
});
