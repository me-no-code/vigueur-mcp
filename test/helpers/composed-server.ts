import { afterEach, expect } from 'vitest';
import { compose } from '../../src/compose.js';
import type { ServerDeps } from '../../src/server.js';
import { type Answer, expectAnswer } from './answer.js';
import { type FixtureRoute, fixtureFetch, sandboxConfig } from './fixture-fetch.js';
import { connectClient, type TestClient } from './mcp-client.js';

export type McpTestClient = TestClient['client'];

type ComposeOptions = NonNullable<Parameters<typeof compose>[1]>;

/**
 * Call once at a test file's top level. Registers an afterEach that closes every client the test
 * opened and fails the test whose requests found no fixture.
 */
export function useServers() {
  let cleanup: Array<() => Promise<void>> = [];
  let unmatchedRoutes: string[][] = [];

  afterEach(async () => {
    for (const close of cleanup.reverse()) await close();
    cleanup = [];
    // Reset before asserting, so one test's unmatched request never fails the next ones.
    const pending = unmatchedRoutes;
    unmatchedRoutes = [];
    for (const unmatched of pending) expect(unmatched, 'requests without a fixture').toEqual([]);
  });

  /** A client over `deps`, closed after the test. */
  async function connect(deps: ServerDeps): Promise<McpTestClient> {
    const { client, close } = await connectClient(deps);
    cleanup.push(close);
    return client;
  }

  return {
    connect,
    /** A client over the composed server, answering PISTE from the recorded fixtures (or `routes`). */
    composed(
      opts: { routes?: readonly FixtureRoute[] } & Omit<ComposeOptions, 'fetch'> = {},
    ): Promise<McpTestClient> {
      const { routes, ...rest } = opts;
      const fixtures = fixtureFetch(routes);
      unmatchedRoutes.push(fixtures.unmatched);
      return connect(compose(sandboxConfig(), { fetch: fixtures.fetch, ...rest }));
    },
    /** Fails the test if `unmatched` (a `fixtureFetch`'s list) holds a request at its end. */
    watch(unmatched: string[]): void {
      unmatchedRoutes.push(unmatched);
    },
  };
}

/** Every page of an answer: `tool` is called again with each page's `next` merged into `args`. */
export async function readAllPages(
  client: McpTestClient,
  tool: string,
  args: Record<string, unknown>,
  expected: { source: string; outcome: string },
): Promise<Answer[]> {
  const pages: Answer[] = [];
  let next: Record<string, unknown> | null = null;
  for (let i = 0; i < 50; i++) {
    const result = await client.callTool({
      name: tool,
      arguments: next === null ? args : { ...args, ...next },
    });
    const a = expectAnswer(result, expected);
    pages.push(a);
    if (a.next === null) return pages;
    next = a.next;
  }
  throw new Error('more than 50 pages');
}
