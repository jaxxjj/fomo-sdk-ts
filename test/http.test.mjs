import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import {
  FomoClient,
  StaticSession,
  RefreshableSession,
  createFetchTransport,
  FomoError,
  createImpitTransport,
} from "../dist/index.js";
import { client, response, envelope, user } from "./helpers.mjs";

test("default construction has no network or credential-discovery work", () => {
  const c = new FomoClient({ session: new StaticSession({ accessToken: "fake" }) });
  assert.equal(typeof c.tokens.holders, "function");
  assert.equal(c.swap, undefined);
});
test("missing session and ambiguous connection options reject at construction", () => {
  assert.throws(() => new FomoClient({}), { kind: "configuration", reason: "session_provider" });
  const c = new FomoClient({ session: new StaticSession({ accessToken: "fake" }) });
  assert.throws(
    () =>
      new FomoClient({
        connection: c.connection,
        session: new StaticSession({ accessToken: "other" }),
      }),
    { kind: "configuration", reason: "connection_options" },
  );
});
test("malformed custom lease never reaches a transport", async () => {
  const { client: c, calls } = client(() => response(envelope(user())), {
    session: {
      acquire: async () => ({ accessToken: "bad\r\nheader", generation: "x" }),
      invalidate() {},
    },
  });
  await assert.rejects(c.users.getCurrent(), { kind: "configuration", reason: "session_lease" });
  assert.equal(calls.length, 0);
});
test("origin validation rejects unsafe URLs", () => {
  for (const baseUrl of [
    "http://example.com",
    "https://a:b@example.com",
    "https://example.com/path",
    "https://example.com/?key=x",
    "https://example.com/#fragment",
  ]) {
    assert.throws(() => client(() => response(envelope(null)), { baseUrl }), {
      kind: "configuration",
    });
  }
});
test("headers, account binding and metadata", async () => {
  const { client: c, calls } = client(() => response(envelope(user())));
  const out = await c.users.getCurrent();
  assert.equal(out.data.id, "self");
  assert.equal(out.data.followers, 3);
  assert.equal(out.data.totalVolume, "0");
  assert.equal(out.meta.operation, "users.getCurrent");
  assert.equal(calls[0].method, "GET");
  assert.equal(calls[0].headers.authorization, "Bearer synthetic-token");
});
test("an expected account mismatch fails closed", async () => {
  const { client: c } = client(() => response(envelope(user("other"))), {
    expectedAccountId: "self",
  });
  await assert.rejects(c.users.getCurrent(), { kind: "session_changed" });
});
test("HTTP errors cannot be masked by a success envelope", async () => {
  const { client: c } = client(() => response(envelope(user()), 500));
  await assert.rejects(c.users.getCurrent(), { kind: "http", status: 500 });
});
for (const status of [403, 430, 431]) {
  test(`${status} is denied without auto-switching transport or retry`, async () => {
    const { client: c, calls } = client(() => response({ error: "private-secret" }, status), {
      maxRetries: 3,
    });
    await assert.rejects(c.users.getCurrent(), (error) => {
      assert.equal(error.kind, "access_denied");
      assert.equal(error.status, status);
      assert.ok(!JSON.stringify(error).includes("private-secret"));
      return true;
    });
    assert.equal(calls.length, 1);
  });
}
test("401 with a static session sends once", async () => {
  const { client: c, calls } = client(() => response({ error: "no" }, 401), { maxRetries: 3 });
  await assert.rejects(c.users.getCurrent(), { kind: "authentication" });
  assert.equal(calls.length, 1);
});
test("401 reacquires a changed lease exactly once", async () => {
  const session = new RefreshableSession({
    credentials: { accessToken: "old" },
    refresh: async () => ({ action: "set", credentials: { accessToken: "new" } }),
  });
  const { client: c, calls } = client(
    (request) =>
      request.headers.authorization === "Bearer old"
        ? response({}, 401)
        : response(envelope(user())),
    { session },
  );
  assert.equal((await c.users.getCurrent()).data.id, "self");
  assert.equal(calls.length, 2);
});
test("deadline includes blocked credential acquisition", async () => {
  const { client: c, calls } = client(() => response(envelope(user())), {
    timeoutMs: 15,
    session: { acquire: () => new Promise(() => {}), invalidate: () => {} },
  });
  await assert.rejects(c.users.getCurrent(), { kind: "timeout" });
  assert.equal(calls.length, 0);
});
test("cancellation before a request sends nothing", async () => {
  const { client: c, calls } = client(() => response(envelope(user())));
  await assert.rejects(c.users.getCurrent({ signal: AbortSignal.abort() }), { kind: "aborted" });
  assert.equal(calls.length, 0);
});
test("deadline includes response body consumption", async () => {
  const { client: c } = client(() => new Response(new ReadableStream({ start() {} })), {
    timeoutMs: 15,
  });
  await assert.rejects(c.users.getCurrent(), { kind: "timeout" });
});
test("oversized response is rejected", async () => {
  const { client: c } = client(() => response(envelope(user())), { maxResponseBytes: 5 });
  await assert.rejects(c.users.getCurrent(), { kind: "protocol", reason: "response_too_large" });
});
for (const raw of [
  "null",
  "[]",
  "{}",
  '{"success":true,"statusCode":200}',
  '{"success":true,"success":false,"statusCode":200,"responseObject":{}}',
  "not-json",
]) {
  test(`invalid envelope: ${raw.slice(0, 35)}`, async () => {
    await assert.rejects(client(() => response(raw)).client.users.getCurrent(), {
      kind: "protocol",
    });
  });
}
test("business errors stay errors", async () => {
  await assert.rejects(
    client(() =>
      response({ success: false, statusCode: 422, responseObject: null }),
    ).client.users.getCurrent(),
    { kind: "api" },
  );
});
test("transient 503 retry is bounded", async () => {
  const { client: c, calls } = client(
    (_request, n) => (n === 1 ? response({}, 503) : response(envelope(user()))),
    { maxRetries: 1 },
  );
  await c.users.getCurrent();
  assert.equal(calls.length, 2);
});
test("long server cooldown is preserved and shared, not shortened", async () => {
  const { client: c, calls } = client(() => response({}, 429, { "retry-after": "30" }), {
    maxRetries: 2,
    maxRetryDelayMs: 50,
  });
  await assert.rejects(c.users.getCurrent(), { kind: "rate_limited", retryAfterMs: 30000 });
  await assert.rejects(c.users.getCurrent(), { kind: "rate_limited" });
  assert.equal(calls.length, 1);
});
test("queued requests can abort without leaking capacity", async () => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const { client: c, calls } = client(
    async (_request, n) => {
      if (n === 1) await gate;
      return response(envelope(user()));
    },
    { maxConcurrency: 1 },
  );
  const first = c.users.getCurrent();
  await new Promise((resolve) => setImmediate(resolve));
  const abort = new AbortController();
  const pending = c.users.getCurrent({ signal: abort.signal });
  abort.abort();
  await assert.rejects(pending, { kind: "aborted" });
  release();
  await first;
  await c.users.getCurrent();
  assert.equal(calls.length, 2);
});
test("queue size has a hard bound", async () => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const { client: c } = client(
    async () => {
      await gate;
      return response(envelope(user()));
    },
    { maxConcurrency: 1, maxQueueSize: 0 },
  );
  const first = c.users.getCurrent();
  await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(c.users.getCurrent(), { kind: "queue_full" });
  release();
  await first;
});
for (const [name, transport] of [
  ["fetch", () => createFetchTransport()],
  ["impit", () => createImpitTransport()],
]) {
  test(`${name} adapter rejects redirects without forwarding credentials`, async (t) => {
    let leaked = false;
    const target = createServer((req, res) => {
      leaked = Boolean(req.headers.authorization);
      res.end(JSON.stringify(envelope(user())));
    });
    const origin = createServer((_req, res) => {
      res.writeHead(302, { location: `http://127.0.0.1:${target.address().port}/sink` });
      res.end();
    });
    for (const server of [target, origin]) {
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      t.after(() => {
        server.closeAllConnections();
        server.close();
      });
    }
    const c = new FomoClient({
      session: new StaticSession({ accessToken: "synthetic" }),
      transport: transport(),
      baseUrl: `http://127.0.0.1:${origin.address().port}`,
      allowInsecureLocalhost: true,
      maxRetries: 0,
    });
    await assert.rejects(c.users.getCurrent(), FomoError);
    assert.equal(leaked, false);
  });
}
