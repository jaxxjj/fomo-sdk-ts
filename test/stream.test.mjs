import test from "node:test";
import assert from "node:assert/strict";
import { StaticSession, RefreshableSession } from "../dist/index.js";
import { FomoStreamClient } from "../dist/experimental/stream.js";
import { client, response, envelope, user } from "./helpers.mjs";

class FakeSocket extends EventTarget {
  sent = [];
  closed = false;
  constructor(mode = "normal") {
    super();
    this.mode = mode;
    queueMicrotask(() => {
      if (mode !== "silent") this.frame({ type: "challenge" });
    });
  }
  frame(data) {
    if (!this.closed)
      this.dispatchEvent(
        new MessageEvent("message", {
          data: typeof data === "string" ? data : JSON.stringify(data),
        }),
      );
  }
  send(text) {
    const data = JSON.parse(text);
    this.sent.push(data);
    if (data.type === "challengeResponse")
      queueMicrotask(() => this.frame({ type: "challengeAccepted" }));
    if (data.type === "subscribe")
      queueMicrotask(() =>
        this.frame({
          type: "subscribed",
          topicType: "trading_activity",
          topicId: this.mode === "wrong-account" ? "other" : data.topicId,
        }),
      );
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.dispatchEvent(new Event("close"));
  }
  disconnect() {
    this.dispatchEvent(new Event("close"));
  }
}
function setup(mode = "normal", options = {}) {
  const sockets = [];
  const { client: c } = client(() => response(envelope(user())), options);
  const stream = new FomoStreamClient(c, () => {
    const socket = new FakeSocket(mode);
    sockets.push(socket);
    return socket;
  });
  return { sockets, stream, client: c };
}
test("stream authenticates current account, keeps payload decimal precision, and closes on return", async () => {
  const { sockets, stream } = setup();
  const iterator = stream.activity({ maxReconnects: 0 });
  assert.equal((await iterator.next()).value.state, "connecting");
  assert.equal((await iterator.next()).value.state, "ready");
  assert.equal(sockets[0].sent[1].topicId, "self");
  sockets[0].frame(
    '{"type":"data","topicType":"trading_activity","topicId":"self","payload":{"id":"a","amount":900719925474099312345}}',
  );
  const next = await iterator.next();
  assert.equal(next.value.kind, "activity");
  assert.equal(next.value.data.amount, "900719925474099312345");
  await iterator.return();
  assert.equal(sockets[0].closed, true);
});
test("mismatched subscription ACK is terminal", async () => {
  const { sockets, stream } = setup("wrong-account");
  const iterator = stream.activity({ maxReconnects: 0 });
  await iterator.next();
  await assert.rejects(iterator.next(), { kind: "protocol", reason: "subscription_mismatch" });
  assert.equal(sockets[0].closed, true);
});
test("handshake cannot hang indefinitely", async () => {
  const { sockets, stream } = setup("silent");
  const iterator = stream.activity({ maxReconnects: 0, handshakeTimeoutMs: 15 });
  await iterator.next();
  await assert.rejects(iterator.next(), { kind: "timeout", reason: "handshake_timeout" });
  assert.equal(sockets[0].closed, true);
});
test("disconnect emits a potential-gap record and reconnects with a bounded budget", async () => {
  const { sockets, stream } = setup();
  const iterator = stream.activity({ maxReconnects: 1, reconnectDelayMs: 0 });
  await iterator.next();
  await iterator.next();
  sockets[0].disconnect();
  assert.equal((await iterator.next()).value.kind, "gap");
  assert.equal((await iterator.next()).value.state, "connecting");
  assert.equal((await iterator.next()).value.state, "ready");
  sockets[1].disconnect();
  await assert.rejects(iterator.next(), { kind: "stream_closed" });
  assert.equal(sockets.length, 2);
});
test("queue overflow fails visibly and closes the socket", async () => {
  const { sockets, stream } = setup();
  const iterator = stream.activity({ maxQueueSize: 1, maxReconnects: 0 });
  await iterator.next();
  await iterator.next();
  sockets[0].frame({
    type: "data",
    topicType: "trading_activity",
    topicId: "self",
    payload: { id: "one" },
  });
  sockets[0].frame({
    type: "data",
    topicType: "trading_activity",
    topicId: "self",
    payload: { id: "two" },
  });
  await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(iterator.next(), { kind: "backpressure" });
  assert.equal(sockets[0].closed, true);
});
test("external cancellation stops delivery of queued records", async () => {
  const { sockets, stream } = setup();
  const abort = new AbortController();
  const iterator = stream.activity({ signal: abort.signal });
  await iterator.next();
  await iterator.next();
  sockets[0].frame({
    type: "data",
    topicType: "trading_activity",
    topicId: "self",
    payload: { id: "queued" },
  });
  abort.abort();
  assert.equal((await iterator.next()).done, true);
  assert.equal(sockets[0].closed, true);
});
test("session invalidation closes stale socket", async () => {
  const session = new StaticSession({ accessToken: "fake" });
  const { sockets, stream } = setup("normal", { session });
  const iterator = stream.activity({ maxReconnects: 0 });
  await iterator.next();
  await iterator.next();
  session.invalidate((await session.acquire()).generation);
  await assert.rejects(iterator.next(), { kind: "session_changed" });
  assert.equal(sockets[0].closed, true);
});
test("a refreshed token for another account is not subscribed", async () => {
  const session = new RefreshableSession({
    credentials: { accessToken: "old" },
    refresh: async () => ({ action: "set", credentials: { accessToken: "new" } }),
  });
  const sockets = [];
  const { client: c } = client(
    (req) =>
      response(envelope(user(req.headers.authorization === "Bearer old" ? "self" : "other"))),
    { session },
  );
  const stream = new FomoStreamClient(c, () => {
    const socket = new FakeSocket();
    sockets.push(socket);
    return socket;
  });
  const iterator = stream.activity({ maxReconnects: 1, reconnectDelayMs: 0 });
  await iterator.next();
  await iterator.next();
  session.invalidate((await session.acquire()).generation);
  assert.equal((await iterator.next()).value.kind, "gap");
  assert.equal((await iterator.next()).value.state, "connecting");
  await assert.rejects(iterator.next(), { kind: "session_changed", reason: "account_mismatch" });
  assert.equal(sockets.length, 1);
});
for (const [frame, reason] of [
  [
    { type: "data", topicType: "trading_activity", topicId: "other", payload: {} },
    "data_topic_mismatch",
  ],
  ["not-json", "invalid_json"],
]) {
  test(`invalid WS frame: ${reason}`, async () => {
    const { sockets, stream } = setup();
    const iterator = stream.activity({ maxReconnects: 0 });
    await iterator.next();
    await iterator.next();
    sockets[0].frame(frame);
    await assert.rejects(iterator.next(), { kind: "protocol", reason });
    assert.equal(sockets[0].closed, true);
  });
}
test("AUTH_REQUIRED is terminal rather than an infinite subscription loop", async () => {
  const { sockets, stream } = setup();
  const iterator = stream.activity();
  await iterator.next();
  await iterator.next();
  sockets[0].frame({ type: "error", code: "AUTH_REQUIRED" });
  await assert.rejects(iterator.next(), { kind: "authentication" });
  assert.equal(sockets.length, 1);
});
test("unknown frame types are surfaced without guessing their payload meaning", async () => {
  const { sockets, stream } = setup();
  const iterator = stream.activity();
  await iterator.next();
  await iterator.next();
  sockets[0].frame({ type: "future-control", payload: {} });
  assert.equal((await iterator.next()).value.kind, "unknown");
  await iterator.return();
});
test("return cancels a custom provider that ignores its signal", async () => {
  let calls = 0;
  const session = {
    acquire: async () =>
      ++calls === 1 ? { accessToken: "fake", generation: "one" } : new Promise(() => {}),
    invalidate() {},
  };
  const { stream } = setup("normal", { session });
  const iterator = stream.activity();
  await iterator.next();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal((await iterator.return()).done, true);
});
