import type { CallToolResult } from '@modelcontextprotocol/server';
import { VigueurError } from '../shared/errors.js';
import { SOURCE_LABELS, type SourceId } from '../shared/source-id.js';
import { deadlineHit } from './format.js';

function hintFor(err: VigueurError, source: SourceId): string | undefined {
  const label = SOURCE_LABELS[err.details?.source ?? source];
  switch (err.kind) {
    case 'credentials_missing':
      return 'PISTE credentials are not configured. Call vigueur_status for setup instructions.';
    case 'credentials_invalid':
      return 'PISTE rejected the credentials. Check PISTE_CLIENT_ID and PISTE_CLIENT_SECRET, and PISTE_ENV (sandbox credentials only work with PISTE_ENV=sandbox). Call vigueur_status to diagnose.';
    case 'api_not_enabled':
      return 'This API is not enabled on your PISTE application. Call vigueur_status for the steps to enable it.';
    case 'forbidden':
      return 'PISTE refused this request (HTTP 403). Call vigueur_status to check that the API is enabled on your PISTE application.';
    case 'quota_exceeded':
      return err.details?.retryAfterSeconds !== undefined
        ? `PISTE quota reached. Retry in about ${err.details.retryAfterSeconds} s.`
        : 'PISTE quota reached. Wait a moment and try again.';
    case 'upstream_unavailable':
      return 'PISTE is unavailable or timed out. Wait a moment and try again; if it persists, call vigueur_status.';
    case 'unexpected_response':
      return `${label} returned a response Vigueur does not understand (possibly an API change). Try again later; if it persists, report it.`;
    case 'deadline':
      return `${label} did not answer within 45 s; try again in a moment.`;
    case 'not_found':
    case 'invalid_input':
    case 'cancelled':
      return undefined;
  }
}

function textResult(text: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text }] };
}

const isAbortShaped = (err: unknown): boolean =>
  (err instanceof VigueurError && err.kind === 'cancelled') ||
  (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError'));

/**
 * The error result for a failed tool call. Pass the call's `callSignal`: when its deadline (not
 * the MCP client) cut the call short and the error is an abort, the answer is the `deadline`
 * error. Any other error is rendered as it is, so a real failure is never masked.
 */
export function toToolError(
  err: unknown,
  signal?: AbortSignal,
  source: SourceId = 'legifrance',
): CallToolResult {
  if (signal !== undefined && deadlineHit(signal) && isAbortShaped(err)) {
    return toToolError(
      new VigueurError('deadline', `${SOURCE_LABELS[source]} did not answer in time.`, { source }),
    );
  }
  if (err instanceof VigueurError) {
    const hint = hintFor(err, source);
    return textResult(hint ? `${err.message}\n\n${hint}` : err.message);
  }
  console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
  const message = err instanceof Error ? err.message : String(err);
  return textResult(`Unexpected error: ${message}. Call vigueur_status to check the setup.`);
}
