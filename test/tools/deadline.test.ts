import { afterEach, describe, expect, it } from 'vitest';
import type { ServerDeps } from '../../src/server.js';
import { createJudilibreSource, type JudilibreServices } from '../../src/tools/judilibre/index.js';
import {
  createLegifranceSource,
  type LegifranceServices,
} from '../../src/tools/legifrance/index.js';
import { sandboxConfig } from '../helpers/fixture-fetch.js';
import { connectClient, firstText } from '../helpers/mcp-client.js';

/** Valid minimal arguments for every tool that reaches an upstream API (all but vigueur_status). */
const MINIMAL_ARGS: Record<string, Record<string, unknown>> = {
  legifrance_get_article: { code: 'Code civil', number: '1240' },
  legifrance_get_article_history: { code: 'Code civil', number: '1240' },
  legifrance_search_legislation: { collection: 'codes', query: 'responsabilité' },
  legifrance_list_changes: { code: 'Code civil', since: '2024-01-01' },
  legifrance_get_text: { id: 'LEGITEXT000006070721' },
  legifrance_browse_code: { code: 'Code civil' },
  legifrance_latest_jo: {},
  legifrance_list_reference_values: { kind: 'codes' },
  legifrance_search_case_law: { collection: 'judicial', query: 'forfait jours' },
  legifrance_get_decision: { id: 'JURITEXT000053197030' },
  judilibre_search_decisions: { query: 'forfait jours' },
  judilibre_get_decision: { id: '6a0e9ff1cdc6046d47668703' },
  judilibre_list_taxonomy: { list: 'chamber' },
};

/** A service that never answers: it rejects with the signal's abort reason once the call is aborted. */
function never(): (...args: unknown[]) => Promise<never> {
  return (...args) => {
    const ctx = args.find((a) => a && typeof a === 'object' && 'signal' in a) as
      | { signal?: AbortSignal }
      | undefined;
    return new Promise((_resolve, reject) => {
      const signal = ctx?.signal;
      if (signal?.aborted) reject(signal.reason);
      signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
  };
}

const neverServices: LegifranceServices = {
  getArticle: never(),
  getArticleHistory: never(),
  searchLegislation: never(),
  listChanges: never(),
  getText: never(),
  browseCode: never(),
  latestJo: never(),
  listReferenceValues: never(),
  searchCaseLaw: never(),
  getDecision: never(),
};

const neverJudilibre: JudilibreServices = {
  searchDecisions: never(),
  getDecision: never(),
  listTaxonomy: never(),
};

/** The server under test: add each source's module here, with never-answering services. */
const deps = (): ServerDeps => ({
  config: sandboxConfig(),
  getStatus: () => Promise.reject(new Error('not used')),
  sources: [
    createLegifranceSource(neverServices, { deadlineMs: 20 }),
    createJudilibreSource(neverJudilibre, { deadlineMs: 20 }),
  ],
});

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((close) => close()));
});

describe('per-call deadline over every tool', () => {
  it('has minimal arguments for every registered tool', async () => {
    const { client, close } = await connectClient(deps());
    cleanup.push(close);
    const { tools } = await client.listTools();
    expect(Object.keys(MINIMAL_ARGS).sort()).toEqual(
      tools
        .map((t) => t.name)
        .filter((name) => name !== 'vigueur_status')
        .sort(),
    );
  });

  for (const [name, args] of Object.entries(MINIMAL_ARGS)) {
    it(`${name} answers with the deadline error when the source never answers`, async () => {
      const { client, close } = await connectClient(deps());
      cleanup.push(close);
      const result = await client.callTool({ name, arguments: args });
      expect(result.isError).toBe(true);
      const source = name.startsWith('judilibre_') ? 'Judilibre' : 'Légifrance';
      expect(firstText(result)).toContain(`${source} did not answer within 45 s`);
    });
  }
});
