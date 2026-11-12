import type { CallToolResult } from '@modelcontextprotocol/server';
import { VigueurError } from '../shared/errors.js';

function hintFor(err: VigueurError): string | undefined {
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
    case 'not_found':
    case 'invalid_input':
    case 'cancelled':
      return undefined;
  }
}

function textResult(text: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text }] };
}

export function toToolError(err: unknown): CallToolResult {
  if (err instanceof VigueurError) {
    const hint = hintFor(err);
    return textResult(hint ? `${err.message}\n\n${hint}` : err.message);
  }
  console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
  const message = err instanceof Error ? err.message : String(err);
  return textResult(`Unexpected error: ${message}. Call vigueur_status to check the setup.`);
}
