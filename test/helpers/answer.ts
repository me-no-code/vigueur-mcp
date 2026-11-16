import { expect } from 'vitest';
import { pisteEndpoints } from '../../src/clients/piste/endpoints.js';
import type { FetchLike } from '../../src/shared/fetch.js';
import { MAX_TOOL_TEXT } from '../../src/tools/format.js';
import { VERSION } from '../../src/version.js';
import { fakeFetch } from './fake-fetch.js';

/** The envelope fields every answer starts with, in order. */
export const ENVELOPE_HEAD = ['source', 'outcome', 'warnings'];
/** The envelope fields every answer ends with, in order. */
export const ENVELOPE_TAIL = ['request', 'retrieved', 'cached', 'vigueur_version'];

/** The fields of an error answer, in order (`retrieved` only when the source answered). */
const ERROR_KEYS = ['source', 'outcome', 'error', 'request', 'retrieved', 'vigueur_version'];

const PICTOGRAPH = /\p{Extended_Pictographic}/u;

/** An answer as tests read it: any field, at any depth. */
// biome-ignore lint/suspicious/noExplicitAny: tests read the answer's fields freely.
type Answer = Record<string, any>;

interface ToolResult {
  isError?: boolean;
  structuredContent?: unknown;
  content?: unknown;
}

/** The text of `result`'s only content block (asserts there is exactly one, of type text). */
function onlyText(result: ToolResult): string {
  const content = result.content as Array<{ type: string; text?: string }>;
  expect(content).toHaveLength(1);
  expect(content[0]?.type).toBe('text');
  return content[0]?.text ?? '';
}

/**
 * Asserts `result` is a successful answer through the envelope, from `expected.source` with
 * `expected.outcome`, and returns its `structuredContent`.
 */
export function expectAnswer(
  result: unknown,
  expected: { source: string; outcome: string },
): Answer {
  const r = result as ToolResult;
  expect(r.isError, 'isError').toBeFalsy();
  const answer = r.structuredContent as Answer;
  expect(typeof answer === 'object' && answer !== null && !Array.isArray(answer)).toBe(true);
  const text = onlyText(r);
  expect(text).toBe(JSON.stringify(answer));
  const keys = Object.keys(answer);
  expect(keys.slice(0, ENVELOPE_HEAD.length)).toEqual(ENVELOPE_HEAD);
  expect(keys.slice(-ENVELOPE_TAIL.length)).toEqual(ENVELOPE_TAIL);
  expect(answer.retrieved).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
  expect(answer.vigueur_version).toBe(VERSION);
  expect(text.length).toBeLessThanOrEqual(MAX_TOOL_TEXT);
  expect(text).not.toMatch(PICTOGRAPH);
  expect({ source: answer.source, outcome: answer.outcome }).toEqual(expected);
  return answer;
}

/** Asserts `result` is an error answer of `kind` and returns it, parsed. */
export function expectToolError(result: unknown, kind: string): Answer {
  const r = result as ToolResult;
  expect(r.isError, 'isError').toBe(true);
  expect(r.structuredContent, 'structuredContent').toBeUndefined();
  const text = onlyText(r);
  expect(text).not.toMatch(PICTOGRAPH);
  const e = JSON.parse(text) as Answer;
  expect(Object.keys(e)).toEqual(ERROR_KEYS.filter((k) => k !== 'retrieved' || 'retrieved' in e));
  expect(e.outcome).toBe('error');
  expect(e.error).toEqual({ kind, message: expect.any(String) });
  expect(Object.keys(e.error)).toEqual(['kind', 'message']);
  return e;
}

/**
 * A `fetch` serving the sandbox OAuth token (as `fixtureFetch` does) and refusing every Légifrance
 * and Judilibre API request with HTTP 403 and body `{}`: each becomes a `forbidden` error whose
 * `details.status` is 403.
 */
export function deniedFetch(): FetchLike {
  const endpoints = pisteEndpoints('sandbox');
  return fakeFetch((req) => {
    if (req.method === 'POST' && req.url === endpoints.oauthTokenUrl) {
      return Response.json({ access_token: 'fixture-token', expires_in: 3600 });
    }
    if (
      req.url.startsWith(endpoints.legifranceBaseUrl) ||
      req.url.startsWith(endpoints.judilibreBaseUrl)
    ) {
      return Response.json({}, { status: 403 });
    }
    return new Response(`deniedFetch: no route for ${req.method} ${req.url}`, { status: 404 });
  }).fetch;
}
