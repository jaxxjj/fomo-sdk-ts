import test from "node:test";
import assert from "node:assert/strict";
import { createPrivyRefresher, createPrivySession } from "../dist/experimental/privy.js";
const credentials = {
  accessToken: "app",
  refreshToken: "refresh",
  privyAccessToken: "privy",
  clientAuthId: "ca",
};
for (const status of [401, 403, 429, 500])
  test(`Privy rejects HTTP ${status} even with success body`, async () => {
    const refresh = createPrivyRefresher({
      fetch: async () => new Response('{"session_update_action":"ignore"}', { status }),
    });
    await assert.rejects(refresh(credentials, { signal: new AbortController().signal }), {
      kind: "authentication",
      status,
      reason: "refresh_rejected",
    });
  });
for (const key of ["refresh_token", "privy_access_token"])
  for (const value of ["", 42, {}, false])
    test(`invalid rotated credential ${key}/${JSON.stringify(value)}`, async () => {
      const refresh = createPrivyRefresher({
        fetch: async () =>
          new Response(
            JSON.stringify({ session_update_action: "set", token: "new", [key]: value }),
          ),
      });
      await assert.rejects(refresh(credentials, { signal: new AbortController().signal }), {
        kind: "protocol",
        reason: "invalid_rotated_credential",
      });
    });
for (const key of ["appId", "clientId", "clientVersion"])
  test(`Privy header injection ${key}`, () => {
    assert.throws(() => createPrivyRefresher({ [key]: "bad\r\nheader" }), {
      kind: "configuration",
      reason: "privy_header",
    });
  });
test("Privy session factory delegates to the same single-owner refresh provider", async () => {
  let calls = 0;
  const session = createPrivySession({
    credentials,
    privy: {
      fetch: async () => {
        calls++;
        return new Response('{"session_update_action":"set","token":"new"}');
      },
    },
  });
  const old = await session.acquire();
  session.invalidate(old.generation);
  assert.equal((await session.acquire()).accessToken, "new");
  assert.equal(calls, 1);
});
test("a numeric app token is not promoted into a credential string", async () => {
  const refresh = createPrivyRefresher({
    fetch: async () => new Response('{"session_update_action":"set","token":42}'),
  });
  await assert.rejects(refresh(credentials, { signal: new AbortController().signal }), {
    kind: "protocol",
    reason: "unknown_refresh_response",
  });
});
test("duplicate auth response keys remain a protocol failure", async () => {
  const refresh = createPrivyRefresher({
    fetch: async () => new Response('{"session_update_action":"set","token":"a","token":"b"}'),
  });
  await assert.rejects(refresh(credentials, { signal: new AbortController().signal }), {
    kind: "protocol",
    reason: "invalid_json",
  });
});
for (const key of ["appId", "clientId", "clientVersion"])
  test(`non-string Privy header ${key}`, () => {
    assert.throws(() => createPrivyRefresher({ [key]: 42 }), {
      kind: "configuration",
      reason: "privy_header",
    });
  });
