import type { CallToolResult } from '@modelcontextprotocol/server';
import { VigueurError } from '../shared/errors.js';
import { SOURCE_LABELS, type SourceId } from '../shared/source-id.js';
import { VERSION } from '../version.js';
import { isoSecond, logOversize, type Pointer } from './envelope.js';
import { DEFAULT_DEADLINE_MS, deadlineHit } from './format.js';

/** The hint that follows an error's message; `label` names the source in it. */
function hintFor(err: VigueurError, label: string): string | undefined {
  switch (err.kind) {
    case 'quota_exceeded':
      return err.details?.retryAfterSeconds !== undefined
        ? `PISTE quota reached. Retry in about ${err.details.retryAfterSeconds} s.`
        : 'PISTE quota reached. Wait a moment and try again.';
    case 'upstream_unavailable':
      return 'PISTE is unavailable or timed out. Wait a moment and try again; if it persists, call vigueur_status.';
    case 'unexpected_response':
      return `${label} returned a response Vigueur does not understand (possibly an API change). Try again later; if it persists, report it.`;
    case 'credentials_invalid':
    case 'forbidden':
    case 'deadline':
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

/** Logs a non-Vigueur error's stack on stderr and returns the message the answer gives for it. */
function unexpectedMessage(err: unknown): string {
  console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
  const message = err instanceof Error ? err.message : String(err);
  return `Unexpected error: ${message}. Call vigueur_status to check the setup.`;
}

/** What `toolError` needs to know about the failed call. */
export interface ErrorContext {
  /** The source the tool reads; `piste` for `vigueur_status`. */
  source: SourceId | 'piste';
  /** The call's request echo (`requestEcho`). */
  request: Pointer;
  /** The call's `callSignal`. */
  signal?: AbortSignal;
  /** The call's deadline in milliseconds (default `DEFAULT_DEADLINE_MS`). */
  deadlineMs?: number;
  /** The clock `retrieved` is read from (default: the system clock). */
  now?: () => Date;
}

const sourceName = (source: SourceId | 'piste'): string =>
  source === 'piste' ? 'PISTE' : SOURCE_LABELS[source];

/**
 * The JSON error result for a failed tool call: `source`, `outcome: "error"`, `error` (`kind`,
 * `message`), `request`, `retrieved` when the source answered with an HTTP status, and
 * `vigueur_version`. When the call's deadline (not the MCP client) cut it short and the error is
 * an abort, the error is `deadline`; any other error is reported as it is, so a real failure is
 * never masked. A non-Vigueur error is `unexpected`, its stack logged on stderr. A text over
 * `MAX_TOOL_TEXT` is logged on stderr (`logOversize`).
 */
export function toolError(err: unknown, ctx: ErrorContext): CallToolResult {
  let source = sourceName(ctx.source);
  let error: { kind: string; message: string };
  let status: number | undefined;
  if (ctx.signal !== undefined && deadlineHit(ctx.signal) && isAbortShaped(err)) {
    const seconds = Math.round((ctx.deadlineMs ?? DEFAULT_DEADLINE_MS) / 1000);
    error = {
      kind: 'deadline',
      message: `${source} did not answer within ${seconds} s. Try again in a moment.`,
    };
  } else if (err instanceof VigueurError) {
    if (err.details?.source !== undefined) source = SOURCE_LABELS[err.details.source];
    const hint = hintFor(err, source);
    error = { kind: err.kind, message: hint ? `${err.message} ${hint}` : err.message };
    status = err.details?.status;
  } else {
    error = { kind: 'unexpected', message: unexpectedMessage(err) };
  }
  const answer = {
    source,
    outcome: 'error',
    error,
    request: ctx.request,
    ...(status !== undefined && { retrieved: isoSecond(ctx.now?.() ?? new Date()) }),
    vigueur_version: VERSION,
  };
  const text = JSON.stringify(answer);
  logOversize(text, ctx.request.tool, source, 'error');
  return textResult(text);
}
