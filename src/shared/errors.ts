import type { SourceId } from './source-id.js';

export type ErrorKind =
  | 'credentials_missing'
  | 'credentials_invalid'
  | 'api_not_enabled'
  | 'forbidden'
  | 'quota_exceeded'
  | 'upstream_unavailable'
  | 'not_found'
  | 'invalid_input'
  | 'cancelled'
  | 'unexpected_response'
  | 'deadline';

export interface ErrorDetails {
  source?: SourceId;
  status?: number;
  retryAfterSeconds?: number;
}

export class VigueurError extends Error {
  constructor(
    readonly kind: ErrorKind,
    message: string,
    readonly details?: ErrorDetails,
  ) {
    super(message);
    this.name = 'VigueurError';
  }
}
