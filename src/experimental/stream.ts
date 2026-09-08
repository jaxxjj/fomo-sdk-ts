import type { FomoClient } from "../client.js";
import type { SessionLease } from "../auth/session.js";
import { FomoError } from "../errors.js";
import { decodeJson } from "../http/response.js";
import { object } from "../contracts/validation.js";
import { abortable, integer, sleep } from "../internal/async.js";
import { BoundedQueue } from "../internal/queue.js";

export type StreamRecord =
  | { kind: "state"; state: "connecting" | "ready"; connection: number }
  | {
      kind: "gap";
      reason: "disconnected" | "session_changed";
      connection: number;
      observedAt: string;
    }
  | { kind: "activity"; data: Record<string, unknown>; observedAt: string; connection: number }
  | { kind: "unknown"; frameType: string; connection: number };
export type SocketFactory = (
  url: string,
) => Pick<WebSocket, "addEventListener" | "removeEventListener" | "send" | "close">;
export interface StreamOptions {
  signal?: AbortSignal;
  maxQueueSize?: number;
  maxReconnects?: number;
  handshakeTimeoutMs?: number;
  reconnectDelayMs?: number;
  maxMessageBytes?: number;
}

/** Experimental: ACK is qualified; real data, heartbeat and recovery are not. */
export class FomoStreamClient {
  constructor(
    private readonly client: FomoClient,
    private readonly socketFactory: SocketFactory = (url) => new WebSocket(url),
  ) {}
  async *activity(options: StreamOptions = {}): AsyncGenerator<StreamRecord> {
    const config = {
      maxQueueSize: integer(options.maxQueueSize ?? 128, 1, 10000, "stream_queue"),
      maxReconnects: integer(options.maxReconnects ?? 3, 0, 20, "reconnects"),
      handshakeTimeoutMs: integer(
        options.handshakeTimeoutMs ?? 8000,
        1,
        60000,
        "handshake_timeout",
      ),
      reconnectDelayMs: integer(options.reconnectDelayMs ?? 500, 0, 30000, "reconnect_delay"),
      maxMessageBytes: integer(
        options.maxMessageBytes ?? 1024 * 1024,
        1,
        8 * 1024 * 1024,
        "message_limit",
      ),
    };
    const local = new AbortController();
    const signal = options.signal ? AbortSignal.any([local.signal, options.signal]) : local.signal;
    const queue = new BoundedQueue<StreamRecord>(config.maxQueueSize);
    const emit = (record: StreamRecord) => queue.push(record);
    const producer = this.#run(config, signal, emit).then(
      () => queue.end(),
      (error) => queue.fail(error),
    );
    try {
      for (;;) {
        if (signal.aborted) return;
        const next = await queue.next();
        if (next.done || signal.aborted) return;
        yield next.value;
      }
    } finally {
      local.abort();
      await producer;
    }
  }
  async #run(
    config: Required<Omit<StreamOptions, "signal">>,
    signal: AbortSignal,
    emit: (record: StreamRecord) => void,
  ): Promise<void> {
    for (let connection = 0; !signal.aborted; connection++) {
      try {
        emit({ kind: "state", state: "connecting", connection });
        const me = await this.client.users.getCurrent({ signal });
        const lease = await abortable(this.client.connection.session.acquire({ signal }), signal);
        if (lease.generation !== me.meta.sessionGeneration)
          throw new FomoError("session_changed", { reason: "credentials_changed" });
        await this.#once(me.data.id, lease, config, signal, connection, emit);
        return;
      } catch (error) {
        if (signal.aborted) return;
        const failure = error instanceof FomoError ? error : new FomoError("network");
        const reconnect =
          failure.kind === "network" ||
          failure.kind === "stream_closed" ||
          (failure.kind === "timeout" && failure.reason === "handshake_timeout") ||
          (failure.kind === "session_changed" && failure.reason === "credentials_changed");
        if (!reconnect || connection >= config.maxReconnects) throw failure;
        emit({
          kind: "gap",
          reason: failure.kind === "session_changed" ? "session_changed" : "disconnected",
          connection,
          observedAt: new Date().toISOString(),
        });
        await sleep(Math.min(30000, config.reconnectDelayMs * 2 ** connection), signal);
      }
    }
  }
  #once(
    accountId: string,
    lease: SessionLease,
    config: Required<Omit<StreamOptions, "signal">>,
    signal: AbortSignal,
    connection: number,
    emit: (record: StreamRecord) => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        resolve();
        return;
      }
      const origin = new URL(this.client.connection.origin);
      origin.protocol = origin.protocol === "https:" ? "wss:" : "ws:";
      const socket = this.socketFactory(new URL("/ws", origin).toString());
      let finished = false;
      let answered = false;
      let subscribed = false;
      let ready = false;
      let unsubscribe: (() => void) | undefined;
      const finish = (error?: FomoError) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        signal.removeEventListener("abort", abort);
        socket.removeEventListener("message", message);
        socket.removeEventListener("error", failed);
        socket.removeEventListener("close", closed);
        unsubscribe?.();
        try {
          socket.close(1000, "sdk-close");
        } catch {}
        if (error) reject(error);
        else resolve();
      };
      const abort = () => finish();
      const failed = () => finish(new FomoError("network", { reason: "websocket_connection" }));
      const closed = () => finish(new FomoError("stream_closed"));
      const message = (event: MessageEvent) => {
        try {
          if (typeof event.data !== "string")
            throw new FomoError("protocol", { reason: "binary_ws_frame" });
          if (Buffer.byteLength(event.data) > config.maxMessageBytes)
            throw new FomoError("protocol", { reason: "ws_frame_too_large" });
          const data = object(decodeJson(event.data), "ws_frame");
          if (typeof data.type !== "string")
            throw new FomoError("protocol", { reason: "ws_frame_type" });
          if (data.type === "challenge") {
            if (ready) {
              finish(new FomoError("session_changed", { reason: "credentials_changed" }));
              return;
            }
            if (!answered) {
              answered = true;
              socket.send(JSON.stringify({ type: "challengeResponse", jwt: lease.accessToken }));
            }
          } else if (data.type === "challengeAccepted") {
            if (!answered) throw new FomoError("protocol", { reason: "unexpected_auth_ack" });
            if (!subscribed) {
              subscribed = true;
              socket.send(
                JSON.stringify({
                  type: "subscribe",
                  topicType: "trading_activity",
                  topicId: accountId,
                }),
              );
            }
          } else if (data.type === "subscribed") {
            if (!subscribed || data.topicType !== "trading_activity" || data.topicId !== accountId)
              throw new FomoError("protocol", { reason: "subscription_mismatch" });
            if (!ready) {
              ready = true;
              clearTimeout(timer);
              emit({ kind: "state", state: "ready", connection });
            }
          } else if (data.type === "data") {
            if (!ready) throw new FomoError("protocol", { reason: "data_before_ack" });
            if (data.topicType !== "trading_activity" || data.topicId !== accountId)
              throw new FomoError("protocol", { reason: "data_topic_mismatch" });
            emit({
              kind: "activity",
              data: object(data.payload, "activity_payload"),
              observedAt: new Date().toISOString(),
              connection,
            });
          } else if (data.type === "error") {
            if (data.code === "AUTH_REQUIRED")
              throw new FomoError("authentication", { reason: "stream_auth_required" });
            throw new FomoError("access_denied", { reason: "subscription_rejected" });
          } else {
            emit({ kind: "unknown", frameType: data.type.slice(0, 64), connection });
          }
        } catch (error) {
          finish(
            error instanceof FomoError ? error : new FomoError("protocol", { reason: "ws_frame" }),
          );
        }
      };
      const timer = setTimeout(
        () => finish(new FomoError("timeout", { reason: "handshake_timeout" })),
        config.handshakeTimeoutMs,
      );
      signal.addEventListener("abort", abort, { once: true });
      socket.addEventListener("message", message);
      socket.addEventListener("error", failed);
      socket.addEventListener("close", closed);
      unsubscribe = this.client.connection.session.subscribe?.(() =>
        finish(new FomoError("session_changed", { reason: "credentials_changed" })),
      );
      if (finished) unsubscribe?.();
      if (signal.aborted) finish();
    });
  }
}
