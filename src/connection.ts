import { FomoError } from "./errors.js";
import type { SessionProvider, SessionLease } from "./auth/session.js";
import { abortable, deadline, integer, sleep } from "./internal/async.js";
import { Scheduler } from "./http/scheduler.js";
import { createImpitTransport, type HttpTransport } from "./http/transport.js";
import { parseEnvelope, readText } from "./http/response.js";
import { READ_QUERIES, type ReadQueryOperation } from "./http/read-queries.js";
/** Website-qualified provider network IDs, not RPC chain IDs. Explicitly overridable. */
export const DEFAULT_SUPPORTED_CHAINS = "1,56,143,4663,8453,1399811149";

export interface RequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}
export interface ResponseMeta {
  operation: string;
  observedAt: string;
  /** SDK contract revision, not an official Fomo API version. */
  contractRevision: "2026-09-09";
  sessionGeneration: string;
  /** Exact chain scope sent with this request; null means explicitly omitted. */
  supportedChains: string | null;
}
export interface ApiResult<T> {
  data: T;
  meta: ResponseMeta;
}
export interface ConnectionOptions {
  session: SessionProvider;
  transport?: HttpTransport;
  baseUrl?: string;
  allowInsecureLocalhost?: boolean;
  /** Defaults to the qualified website scope. Null is legacy no-header replay only. */
  supportedChains?: string | null;
  expectedAccountId?: string;
  timeoutMs?: number;
  maxRetries?: number;
  maxRetryDelayMs?: number;
  maxResponseBytes?: number;
  maxConcurrency?: number;
  maxQueueSize?: number;
}
export type Query = Readonly<
  Record<string, string | number | boolean | readonly string[] | undefined>
>;

function parseOrigin(options: ConnectionOptions): string {
  let url: URL;
  try {
    url = new URL(options.baseUrl ?? "https://prod-api.fomo.family");
  } catch {
    throw new FomoError("configuration", { reason: "base_url" });
  }
  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["127.0.0.1", "[::1]"].includes(url.hostname) &&
        options.allowInsecureLocalhost === true
      ))
  ) {
    throw new FomoError("configuration", { reason: "base_url" });
  }
  return url.origin;
}

/** One origin-bound session and request scheduler, shared by HTTP resources and streams. */
export class FomoConnection {
  readonly session: SessionProvider;
  readonly origin: string;
  readonly #transport: HttpTransport;
  readonly #scheduler: Scheduler;
  readonly #timeout: number;
  readonly #retries: number;
  readonly #maxWait: number;
  readonly #maxBytes: number;
  readonly #supportedChains: string | null;
  #accountId?: string;
  #cooldownUntil = 0;

  constructor(options: ConnectionOptions) {
    if (
      !options?.session ||
      typeof options.session.acquire !== "function" ||
      typeof options.session.invalidate !== "function"
    ) {
      throw new FomoError("configuration", { reason: "session_provider" });
    }
    this.origin = parseOrigin(options);
    this.session = options.session;
    this.#transport = options.transport ?? createImpitTransport();
    this.#scheduler = new Scheduler(options.maxConcurrency ?? 4, options.maxQueueSize ?? 128);
    this.#timeout = integer(options.timeoutMs ?? 15000, 1, 2147483647, "timeout");
    this.#retries = integer(options.maxRetries ?? 1, 0, 3, "retries");
    this.#maxWait = integer(options.maxRetryDelayMs ?? 5000, 0, 2147483647, "retry_wait");
    this.#maxBytes = integer(
      options.maxResponseBytes ?? 4 * 1024 * 1024,
      1,
      64 * 1024 * 1024,
      "response_limit",
    );
    if (
      options.supportedChains != null &&
      (typeof options.supportedChains !== "string" ||
        !/^\d+(?:,\d+)*$/.test(options.supportedChains))
    ) {
      throw new FomoError("configuration", { reason: "supported_chains" });
    }
    this.#supportedChains =
      options.supportedChains === undefined ? DEFAULT_SUPPORTED_CHAINS : options.supportedChains;
    if (
      options.expectedAccountId !== undefined &&
      (typeof options.expectedAccountId !== "string" || !options.expectedAccountId.trim())
    ) {
      throw new FomoError("configuration", { reason: "expected_account_id" });
    }
    this.#accountId = options.expectedAccountId;
  }
  /** Verifies only IDs returned by the current-user resource, not arbitrary profiles. */
  bindAccount(accountId: string): void {
    if (this.#accountId && this.#accountId !== accountId) {
      throw new FomoError("session_changed", { reason: "account_mismatch" });
    }
    this.#accountId = accountId;
  }
  /** Do not silently widen an explicitly configured scope for a token query. */
  requireSupportedChains(networkIds: readonly number[]): void {
    if (this.#supportedChains === null) return;
    const supported = new Set(this.#supportedChains.split(","));
    if (networkIds.some((id) => !Number.isSafeInteger(id) || !supported.has(String(id))))
      throw new FomoError("configuration", { reason: "chain_outside_scope" });
  }
  async request(
    operation: string,
    path: string,
    query: Query = {},
    options: RequestOptions = {},
  ): Promise<ApiResult<unknown>> {
    return this.#send(operation, path, query, options, "GET");
  }
  /** Only independently reviewed read-only POST routes can use this method. */
  async readQuery(
    operation: ReadQueryOperation,
    body: unknown = undefined,
    options: RequestOptions = {},
  ): Promise<ApiResult<unknown>> {
    if (!Object.hasOwn(READ_QUERIES, operation))
      throw new FomoError("configuration", { reason: "read_query", operation });
    let encoded: string | undefined;
    try {
      if (body !== undefined) {
        encoded = JSON.stringify(body, (_key, value: unknown) => {
          if (typeof value === "number" && !Number.isFinite(value)) throw new Error();
          return value;
        });
        if (encoded === undefined || Buffer.byteLength(encoded) > 1024 * 1024) throw new Error();
      }
    } catch {
      throw new FomoError("configuration", { reason: "request_body", operation });
    }
    return this.#send(operation, READ_QUERIES[operation], {}, options, "POST", encoded);
  }
  async #send(
    operation: string,
    path: string,
    query: Query,
    options: RequestOptions,
    method: "GET" | "POST",
    body?: string,
  ): Promise<ApiResult<unknown>> {
    if (
      !path.startsWith("/") ||
      path.startsWith("//") ||
      path.includes("?") ||
      path.includes("#")
    ) {
      throw new FomoError("configuration", { reason: "request_path", operation });
    }
    const url = new URL(path, this.origin);
    if (url.origin !== this.origin)
      throw new FomoError("configuration", { reason: "request_origin" });
    if (url.pathname !== path)
      throw new FomoError("configuration", { reason: "normalized_request_path" });
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        if (value.some((item) => typeof item !== "string"))
          throw new FomoError("configuration", { reason: "query_value", operation });
        for (const item of value) url.searchParams.append(key, item);
        continue;
      }
      if (
        !["string", "number", "boolean"].includes(typeof value) ||
        (typeof value === "number" && !Number.isFinite(value))
      ) {
        throw new FomoError("configuration", { reason: "query_value", operation });
      }
      url.searchParams.set(key, String(value));
    }
    const budget = deadline(
      integer(options.timeoutMs ?? this.#timeout, 1, 2147483647, "timeout"),
      options.signal,
    );
    let retries = 0;
    let renewed = false;
    let attempt = 0;
    try {
      for (;;) {
        budget.signal.throwIfAborted();
        attempt++;
        let lease: SessionLease | undefined;
        try {
          lease = await abortable(this.session.acquire({ signal: budget.signal }), budget.signal);
          if (
            !lease ||
            typeof lease.accessToken !== "string" ||
            !lease.accessToken.trim() ||
            /[\r\n]/.test(lease.accessToken) ||
            typeof lease.generation !== "string" ||
            !lease.generation
          ) {
            throw new FomoError("configuration", { reason: "session_lease" });
          }
          const release = await this.#scheduler.acquire(budget.signal);
          let text: string;
          let response;
          try {
            const cooldown = this.#cooldownUntil - Date.now();
            if (cooldown > this.#maxWait)
              throw new FomoError("rate_limited", { retryAfterMs: cooldown });
            if (cooldown > 0) await sleep(cooldown, budget.signal);
            const headers: Record<string, string> = {
              authorization: `Bearer ${lease.accessToken}`,
              accept: "application/json",
              "content-type": "application/json",
              origin: "https://fomo.family",
              referer: "https://fomo.family/",
            };
            if (this.#supportedChains) headers["x-supported-chains"] = this.#supportedChains;
            try {
              response = await abortable(
                this.#transport.send({
                  url: url.toString(),
                  method,
                  body,
                  headers,
                  signal: budget.signal,
                }),
                budget.signal,
              );
              text = await abortable(
                readText(response, this.#maxBytes, budget.signal),
                budget.signal,
              );
            } catch (error) {
              if (error instanceof FomoError) throw error;
              throw new FomoError("network");
            }
          } finally {
            release();
          }
          const data = parseEnvelope(response.status, response.headers, text);
          return {
            data,
            meta: {
              operation,
              observedAt: new Date().toISOString(),
              contractRevision: "2026-09-09",
              sessionGeneration: lease.generation,
              supportedChains: this.#supportedChains,
            },
          };
        } catch (error) {
          budget.signal.throwIfAborted();
          const failure =
            error instanceof FomoError
              ? error
              : new FomoError("authentication", { reason: "provider_failed" });
          if (failure.status === 401 && failure.kind === "authentication" && lease && !renewed) {
            renewed = true;
            this.session.invalidate(lease.generation);
            continue;
          }
          if (failure.kind === "rate_limited" && failure.retryAfterMs !== undefined) {
            this.#cooldownUntil = Math.max(this.#cooldownUntil, Date.now() + failure.retryAfterMs);
          }
          const retryable =
            failure.kind === "network" ||
            failure.kind === "rate_limited" ||
            (failure.kind === "http" && [500, 502, 503, 504].includes(failure.status ?? 0));
          if (!retryable || retries >= this.#retries) throw failure;
          const delay = Math.max(
            failure.retryAfterMs ?? 0,
            Math.floor(200 * 2 ** retries * (0.5 + Math.random() / 2)),
          );
          if (delay > this.#maxWait) throw failure;
          retries++;
          await sleep(delay, budget.signal);
        }
      }
    } catch (error) {
      const failure = budget.signal.aborted
        ? new FomoError(budget.timedOut() ? "timeout" : "aborted")
        : error instanceof FomoError
          ? error
          : new FomoError("network");
      throw new FomoError(failure.kind, {
        operation,
        attempt,
        status: failure.status,
        reason: failure.reason,
        retryAfterMs: failure.retryAfterMs,
      });
    } finally {
      budget.dispose();
    }
  }
}
