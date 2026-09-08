import { randomUUID } from "node:crypto";
import { FomoError } from "../errors.js";
import { abortable, deadline, integer } from "../internal/async.js";

export interface SessionCredentials {
  accessToken: string;
  /** Unix milliseconds. JWT expiry is only a scheduling hint, not identity verification. */
  expiresAt?: number;
  refreshToken?: string;
  privyAccessToken?: string;
  clientAuthId?: string;
}
export interface SessionLease {
  accessToken: string;
  generation: string;
  expiresAt?: number;
}
export interface SessionProvider {
  acquire(options?: { signal?: AbortSignal }): Promise<SessionLease>;
  invalidate(generation: string): void;
  /** Notifications contain no credentials. Used to stop stale stream connections. */
  subscribe?(listener: () => void): () => void;
}
export type RefreshOutcome =
  { action: "ignore" } | { action: "clear" } | { action: "set"; credentials: SessionCredentials };
export type SessionRefresher = (
  current: Readonly<SessionCredentials>,
  options: { signal: AbortSignal },
) => Promise<RefreshOutcome>;

function credentials(value: SessionCredentials): Readonly<SessionCredentials> {
  if (
    typeof value.accessToken !== "string" ||
    !value.accessToken.trim() ||
    /[\r\n]/.test(value.accessToken)
  )
    throw new FomoError("configuration", { reason: "access_token" });
  let expiresAt = value.expiresAt;
  if (expiresAt === undefined) {
    try {
      const data: unknown = JSON.parse(
        Buffer.from(value.accessToken.split(".")[1], "base64url").toString(),
      );
      if (data && typeof data === "object" && "exp" in data && typeof data.exp === "number") {
        expiresAt = data.exp * 1000;
      }
    } catch {
      /* Opaque tokens are allowed; the service validates them. */
    }
  }
  if (expiresAt !== undefined && !Number.isSafeInteger(expiresAt)) {
    throw new FomoError("configuration", { reason: "expires_at" });
  }
  return Object.freeze({ ...value, expiresAt });
}

export class StaticSession implements SessionProvider {
  readonly #tokens: Readonly<SessionCredentials>;
  readonly #generation = randomUUID();
  #rejected = false;
  #listeners = new Set<() => void>();
  constructor(value: SessionCredentials) {
    this.#tokens = credentials(value);
  }
  async acquire({ signal }: { signal?: AbortSignal } = {}): Promise<SessionLease> {
    if (signal?.aborted) throw new FomoError("aborted");
    if (
      this.#rejected ||
      (this.#tokens.expiresAt !== undefined && this.#tokens.expiresAt <= Date.now())
    ) {
      throw new FomoError("authentication", { reason: "reauthorization_required" });
    }
    return {
      accessToken: this.#tokens.accessToken,
      expiresAt: this.#tokens.expiresAt,
      generation: this.#generation,
    };
  }
  invalidate(generation: string): void {
    if (generation === this.#generation && !this.#rejected) {
      this.#rejected = true;
      for (const listener of this.#listeners) {
        try {
          listener();
        } catch {}
      }
    }
  }
  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }
}

export interface RefreshableSessionOptions {
  credentials: SessionCredentials;
  refresh: SessionRefresher;
  refreshAheadMs?: number;
  refreshTimeoutMs?: number;
  /** Optional secure, atomic persistence. Never called with raw upstream errors. */
  persist?: (credentials: Readonly<SessionCredentials> | undefined) => Promise<void>;
}

/** Share this instance across connections. Does not coordinate separate processes. */
export class RefreshableSession implements SessionProvider {
  #tokens?: Readonly<SessionCredentials>;
  #generation = randomUUID();
  #rejected = false;
  #flight?: Promise<void>;
  #persistPending = false;
  #ignoreUntil = 0;
  #listeners = new Set<() => void>();
  readonly #refresh: SessionRefresher;
  readonly #persist?: RefreshableSessionOptions["persist"];
  readonly #ahead: number;
  readonly #timeout: number;

  constructor(options: RefreshableSessionOptions) {
    this.#tokens = credentials(options.credentials);
    this.#refresh = options.refresh;
    this.#persist = options.persist;
    this.#ahead = integer(options.refreshAheadMs ?? 60000, 0, 2147483647, "refresh_ahead");
    this.#timeout = integer(options.refreshTimeoutMs ?? 12000, 1, 2147483647, "refresh_timeout");
  }
  invalidate(generation: string): void {
    if (generation === this.#generation && !this.#rejected) {
      this.#rejected = true;
      this.#notify();
    }
  }
  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }
  #notify(): void {
    for (const listener of this.#listeners) {
      try {
        listener();
      } catch {}
    }
  }
  async acquire({ signal }: { signal?: AbortSignal } = {}): Promise<SessionLease> {
    if (signal?.aborted) throw new FomoError("aborted");
    if (!this.#tokens && !this.#persistPending)
      throw new FomoError("authentication", { reason: "session_cleared" });
    const exp = this.#tokens?.expiresAt;
    if (
      this.#flight ||
      this.#persistPending ||
      this.#rejected ||
      (exp !== undefined && exp - Date.now() <= this.#ahead && Date.now() >= this.#ignoreUntil)
    ) {
      if (!this.#flight) {
        const flight = this.#update();
        this.#flight = flight;
        void flight.then(
          () => {
            if (this.#flight === flight) this.#flight = undefined;
          },
          () => {
            if (this.#flight === flight) this.#flight = undefined;
          },
        );
      }
      await abortable(this.#flight, signal);
    }
    if (
      !this.#tokens ||
      this.#rejected ||
      (this.#tokens.expiresAt !== undefined && this.#tokens.expiresAt <= Date.now())
    ) {
      throw new FomoError("authentication", { reason: "reauthorization_required" });
    }
    return {
      accessToken: this.#tokens.accessToken,
      expiresAt: this.#tokens.expiresAt,
      generation: this.#generation,
    };
  }
  async #save(): Promise<void> {
    if (!this.#persist || !this.#persistPending) return;
    try {
      await this.#persist(this.#tokens);
      this.#persistPending = false;
    } catch {
      throw new FomoError("session_persistence", { reason: "save_failed" });
    }
  }
  async #update(): Promise<void> {
    if (this.#persistPending) {
      await this.#save();
      return;
    }
    const before = this.#tokens;
    if (!before) throw new FomoError("authentication", { reason: "session_cleared" });
    const limit = deadline(this.#timeout);
    try {
      const outcome = await abortable(
        Promise.resolve().then(() => this.#refresh(before, { signal: limit.signal })),
        limit.signal,
      );
      if (outcome.action === "ignore") {
        this.#ignoreUntil = Math.min(before.expiresAt ?? Date.now() + 5000, Date.now() + 5000);
        if (this.#rejected || (before.expiresAt !== undefined && before.expiresAt <= Date.now())) {
          throw new FomoError("authentication", { reason: "ignored_invalid_session" });
        }
        return;
      }
      if (outcome.action === "clear") {
        this.#tokens = undefined;
        this.#generation = randomUUID();
        this.#rejected = true;
      } else if (outcome.action === "set") {
        const next = credentials(outcome.credentials);
        const rejectedSameToken = this.#rejected && next.accessToken === before.accessToken;
        this.#tokens = next; // Retain rotated material even if persistence fails.
        this.#generation = randomUUID();
        this.#rejected = rejectedSameToken;
        this.#ignoreUntil = 0;
      } else {
        throw new FomoError("protocol", { reason: "unknown_refresh_action" });
      }
      this.#notify();
      this.#persistPending = Boolean(this.#persist);
      await this.#save();
    } catch (error) {
      if (limit.timedOut()) throw new FomoError("timeout", { reason: "refresh_timeout" });
      if (error instanceof FomoError) throw error;
      throw new FomoError("authentication", { reason: "refresh_failed" });
    } finally {
      limit.dispose();
    }
  }
}
