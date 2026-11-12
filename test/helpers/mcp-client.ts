import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import type { ServerDeps } from '../../src/server.js';
import { createServer } from '../../src/server.js';

export interface TestClient {
  client: Client;
  close: () => Promise<void>;
}

/** An MCP client talking in-process to `createServer(deps)` over Streamable HTTP. */
export async function connectClient(deps: ServerDeps): Promise<TestClient> {
  const handler = createMcpHandler(() => createServer(deps));
  const transport = new StreamableHTTPClientTransport(new URL('http://test.local/mcp'), {
    fetch: (url, init) => handler.fetch(new Request(url, init)),
  });
  const client = new Client(
    { name: 'test-harness', version: '1.0.0' },
    { versionNegotiation: { mode: 'auto' } },
  );
  try {
    await client.connect(transport);
  } catch (err) {
    await handler.close();
    throw err;
  }
  return {
    client,
    close: async () => {
      await client.close();
      await handler.close();
    },
  };
}

/** The text of a tool result's first content block. */
export function firstText(result: { content?: unknown }): string {
  const [first] = (result.content ?? []) as Array<{ type: string; text?: string }>;
  return first?.type === 'text' ? (first.text ?? '') : '';
}
