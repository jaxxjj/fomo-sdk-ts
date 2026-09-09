import test from "node:test";
import assert from "node:assert/strict";
import { FomoClient, StaticSession, DEFAULT_SUPPORTED_CHAINS } from "../dist/index.js";
const P = { address: "p", networkId: 4663 },
  B = { address: "b", networkId: 1399811149 };
function setup(options = {}) {
  const calls = [];
  const client = new FomoClient({
    session: new StaticSession({ accessToken: "fake" }),
    maxRetries: 0,
    transport: {
      send: async (req) => {
        calls.push(req);
        return new Response('{"success":true,"statusCode":200,"responseObject":[]}');
      },
    },
    ...options,
  });
  return { client, calls };
}
test("default cross-chain metrics transmit website scope and preserve both requested identities", async () => {
  const { client, calls } = setup();
  const result = await client.tokens.metrics({ tokens: [P, B] });
  assert.equal(calls[0].headers["x-supported-chains"], DEFAULT_SUPPORTED_CHAINS);
  assert.deepEqual(JSON.parse(calls[0].body), ["p:4663", "b:1399811149"]);
  assert.equal(result.meta.supportedChains, DEFAULT_SUPPORTED_CHAINS);
});
test("an explicit narrow scope is never silently widened", async () => {
  const { client, calls } = setup({ supportedChains: "4663" });
  await assert.rejects(client.tokens.metrics({ tokens: [P, B] }), {
    kind: "configuration",
    reason: "chain_outside_scope",
  });
  assert.equal(calls.length, 0);
  await client.tokens.metrics({ tokens: [P] });
  assert.equal(calls[0].headers["x-supported-chains"], "4663");
});
test("legacy no-header scope requires explicit null, not omission", async () => {
  const { client, calls } = setup({ supportedChains: null });
  await client.tokens.metrics({ tokens: [P, B] });
  assert.equal(calls[0].headers["x-supported-chains"], undefined);
});
for (const supportedChains of [42, true, [], {}, "", "sol", "56,"])
  test(`malformed chain scope fails at construction ${JSON.stringify(supportedChains)}`, () => {
    assert.throws(() => setup({ supportedChains }), {
      kind: "configuration",
      reason: "supported_chains",
    });
  });
for (const method of [
  "feed",
  "holders",
  "details",
  "warnings",
  "bars",
  "recentBars",
  "theses",
  "developerHolders",
])
  test(`token request cannot escape configured scope: ${method}`, async () => {
    const { client, calls } = setup({ supportedChains: "56" });
    await assert.rejects(
      async () =>
        client.tokens[method]({ token: P, resolution: "1", from: 0, to: 100, countBack: 2 }),
      { kind: "configuration", reason: "chain_outside_scope" },
    );
    assert.equal(calls.length, 0);
  });
