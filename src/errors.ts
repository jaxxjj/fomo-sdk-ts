export type FomoErrorKind =
  | "configuration"
  | "authentication"
  | "access_denied"
  | "rate_limited"
  | "http"
  | "api"
  | "protocol"
  | "network"
  | "timeout"
  | "aborted"
  | "pagination"
  | "queue_full"
  | "session_changed"
  | "session_persistence"
  | "stream_closed"
  | "backpressure";

export interface ErrorDetails {
  operation?: string;
  reason?: string;
  status?: number;
  retryAfterMs?: number;
  attempt?: number;
}

/** SDK-produced errors exclude raw upstream text, credentials and request URLs. */
export class FomoError extends Error {
  readonly kind: FomoErrorKind;
  readonly operation?: string;
  readonly reason?: string;
  readonly status?: number;
  readonly retryAfterMs?: number;
  readonly attempt?: number;

  constructor(kind: FomoErrorKind, details: ErrorDetails = {}) {
    super(`Fomo ${kind}${details.status === undefined ? "" : ` (HTTP ${details.status})`}`);
    this.name = "FomoError";
    this.kind = kind;
    this.operation = details.operation;
    this.reason = details.reason;
    this.status = details.status;
    this.retryAfterMs = details.retryAfterMs;
    this.attempt = details.attempt;
  }
}
