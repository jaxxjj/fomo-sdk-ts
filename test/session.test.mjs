import test from "node:test";
import assert from "node:assert/strict";
import { StaticSession, RefreshableSession } from "../dist/index.js";
import { createPrivyRefresher } from "../dist/experimental/privy.js";
import { jwt } from "./helpers.mjs";

test("expired static credentials fail before use", async () => {
  const session = new StaticSession({ accessToken: "opaque", expiresAt: Date.now() - 1 });
  await assert.rejects(session.acquire(), { kind: "authentication" });
});
test("JWT expiry is read only as a scheduling hint", async () => {
  await assert.rejects(
    new StaticSession({ accessToken: jwt(Math.floor(Date.now() / 1000) - 5) }).acquire(),
    { kind: "authentication" },
  );
});
test("valid session needs no refresh", async () => {
  let calls = 0;
  const session = new RefreshableSession({
    credentials: { accessToken: "valid" },
    refresh: async () => {
      calls++;
      return { action: "ignore" };
    },
  });
  assert.equal((await session.acquire()).accessToken, "valid");
  assert.equal(calls, 0);
});
test("ignore is permitted while token remains valid", async () => {
  let calls = 0;
  const session = new RefreshableSession({
    credentials: { accessToken: "valid", expiresAt: Date.now() + 30000 },
    refresh: async () => {
      calls++;
      return { action: "ignore" };
    },
  });
  assert.equal((await session.acquire()).accessToken, "valid");
  await session.acquire();
  assert.equal(calls, 1);
});
test("ignore never revives an expired token", async () => {
  const session = new RefreshableSession({
    credentials: { accessToken: "old", expiresAt: Date.now() - 1 },
    refresh: async () => ({ action: "ignore" }),
  });
  await assert.rejects(session.acquire(), {
    kind: "authentication",
    reason: "ignored_invalid_session",
  });
});
test("ignore never replays an explicitly rejected token", async () => {
  const session = new RefreshableSession({
    credentials: { accessToken: "old" },
    refresh: async () => ({ action: "ignore" }),
  });
  session.invalidate((await session.acquire()).generation);
  await assert.rejects(session.acquire(), { kind: "authentication" });
});
test("refresh is single-flight and caller cancellation is independent", async () => {
  let calls = 0,
    finish;
  const gate = new Promise((resolve) => {
    finish = resolve;
  });
  const session = new RefreshableSession({
    credentials: { accessToken: "old", expiresAt: Date.now() - 1 },
    refresh: async () => {
      calls++;
      await gate;
      return {
        action: "set",
        credentials: { accessToken: "new", expiresAt: Date.now() + 3600000 },
      };
    },
  });
  const abort = new AbortController();
  const a = session.acquire({ signal: abort.signal });
  const b = session.acquire();
  abort.abort();
  await assert.rejects(a, { kind: "aborted" });
  finish();
  assert.equal((await b).accessToken, "new");
  assert.equal(calls, 1);
});
test("late rejection cannot invalidate a newer generation", async () => {
  const session = new RefreshableSession({
    credentials: { accessToken: "old" },
    refresh: async () => ({ action: "set", credentials: { accessToken: "new" } }),
  });
  const old = await session.acquire();
  session.invalidate(old.generation);
  const next = await session.acquire();
  session.invalidate(old.generation);
  assert.equal((await session.acquire()).generation, next.generation);
});
test("clear cannot release a token and notifies subscribers", async () => {
  let changes = 0;
  const session = new RefreshableSession({
    credentials: { accessToken: "old" },
    refresh: async () => ({ action: "clear" }),
  });
  const unsubscribe = session.subscribe(() => changes++);
  session.invalidate((await session.acquire()).generation);
  await assert.rejects(session.acquire(), { kind: "authentication" });
  await assert.rejects(session.acquire(), { kind: "authentication" });
  unsubscribe();
  assert.equal(changes, 2);
});
test("failed persistence retains rotated material without refreshing twice", async () => {
  let refreshes = 0,
    writes = 0;
  const session = new RefreshableSession({
    credentials: { accessToken: "old", expiresAt: Date.now() - 1 },
    refresh: async () => {
      refreshes++;
      return { action: "set", credentials: { accessToken: "new", refreshToken: "rotated" } };
    },
    persist: async (value) => {
      writes++;
      assert.equal(value.refreshToken, "rotated");
      if (writes === 1) throw new Error("sensitive");
    },
  });
  await assert.rejects(session.acquire(), { kind: "session_persistence" });
  assert.equal((await session.acquire()).accessToken, "new");
  assert.equal(refreshes, 1);
  assert.equal(writes, 2);
});
test("refresh has its own deadline even if injected callback ignores cancellation", async () => {
  const session = new RefreshableSession({
    credentials: { accessToken: "old", expiresAt: Date.now() - 1 },
    refreshTimeoutMs: 15,
    refresh: () => new Promise(() => {}),
  });
  await assert.rejects(session.acquire(), { kind: "timeout", reason: "refresh_timeout" });
});
const credentials = {
  accessToken: "old",
  privyAccessToken: "pat",
  refreshToken: "refresh",
  clientAuthId: "client",
};
test("Privy ignore does not manufacture tokens", async () => {
  let seen;
  const refresh = createPrivyRefresher({
    fetch: async (url, init) => {
      seen = { url, init };
      return new Response(
        JSON.stringify({ session_update_action: "ignore", token: null, refresh_token: "refresh" }),
      );
    },
  });
  assert.deepEqual(await refresh(credentials, { signal: new AbortController().signal }), {
    action: "ignore",
  });
  assert.equal(seen.init.headers.authorization, "Bearer pat");
  assert.equal(seen.init.redirect, "error");
  assert.deepEqual(JSON.parse(seen.init.body), { refresh_token: "refresh" });
});
test("Privy set preserves omitted rotation fields but derives a new expiry", async () => {
  const access = jwt(Math.floor(Date.now() / 1000) + 3600);
  const refresh = createPrivyRefresher({
    fetch: async () =>
      new Response(JSON.stringify({ session_update_action: "set", token: access })),
  });
  const session = new RefreshableSession({
    credentials: { ...credentials, expiresAt: Date.now() - 1 },
    refresh,
  });
  const lease = await session.acquire();
  assert.equal(lease.accessToken, access);
  assert.ok(lease.expiresAt > Date.now() + 3000000);
});
for (const body of [
  { session_update_action: "clear" },
  { session_update_action: "new-mode" },
  { session_update_action: "set", token: null },
]) {
  test(`Privy ${JSON.stringify(body)}`, async () => {
    const refresh = createPrivyRefresher({ fetch: async () => new Response(JSON.stringify(body)) });
    const call = refresh(credentials, { signal: new AbortController().signal });
    if (body.session_update_action === "clear") assert.deepEqual(await call, { action: "clear" });
    else await assert.rejects(call, { kind: "protocol" });
  });
}
test("Privy rejects absent refresh credentials and sanitizes network errors", async () => {
  const refresh = createPrivyRefresher({
    fetch: async () => {
      throw new Error("secret");
    },
  });
  await assert.rejects(refresh({ accessToken: "x" }, { signal: new AbortController().signal }), {
    kind: "authentication",
  });
  await assert.rejects(refresh(credentials, { signal: new AbortController().signal }), (error) => {
    assert.ok(!error.message.includes("secret"));
    return error.kind === "network";
  });
});
