import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FomoClient, StaticSession } from "../dist/index.js";
import { discoveredCases, callDiscovered, syntheticContext } from "./support/discovered-cases.mjs";
import { methods } from "./support/endpoint-matrix.mjs";
import { Cassette, providerPolicy } from "./support/cassette.mjs";
import { outcome } from "./support/qualification.mjs";
const ledger = JSON.parse(
  readFileSync(new URL("../docs/discovered-qualification.json", import.meta.url), "utf8"),
);
test("independent old and website-discovered inventories cover all public resources", () => {
  const client = new FomoClient({ session: new StaticSession({ accessToken: "synthetic" }) });
  const actual = Object.keys(client)
    .filter((key) => key !== "connection")
    .flatMap((resource) =>
      Object.getOwnPropertyNames(Object.getPrototypeOf(client[resource]))
        .filter((n) => n !== "constructor")
        .map((n) => `${resource}.${n}`),
    );
  assert.deepEqual(
    actual.sort(),
    [...new Set([...methods, ...discoveredCases.map((row) => row.operation)])].sort(),
  );
  assert.deepEqual(
    ledger.cases.map((row) => row.id),
    discoveredCases.map((row) => row.id),
  );
});
for (const entry of discoveredCases) {
  test(`discovered live replay ${entry.id}`, async () => {
    const row = ledger.cases.find((row) => row.id === entry.id);
    assert.equal(row.recorded, true, "Live capture missing");
    const cassette = new Cassette({
      file: new URL(`./fixtures/discovered/${entry.id}.json`, import.meta.url),
      policy: providerPolicy("fomo"),
    });
    const client = new FomoClient({
      session: new StaticSession({ accessToken: "offline" }),
      supportedChains: null, // Historical recordings had no chain header.
      transport: cassette.transport(),
      maxRetries: 0,
    });
    const result = await outcome(
      async () =>
        (await callDiscovered(client, entry.operation, cassette.fixtureInputs.params)).data,
    );
    assert.deepEqual(result, cassette.data.expected);
    assert.equal(result.ok, row.ok);
    cassette.assertConsumed();
  });
  for (const [status, kind] of [
    [403, "access_denied"],
    [429, "rate_limited"],
    [503, "http"],
  ])
    test(`discovered failure ${entry.id}/${status}`, async () => {
      let calls = 0;
      const client = new FomoClient({
        session: new StaticSession({ accessToken: "fake" }),
        maxRetries: 0,
        transport: {
          send: async () => {
            calls++;
            return new Response('{"secret":"not-for-error"}', { status });
          },
        },
      });
      await assert.rejects(
        callDiscovered(client, entry.operation, entry.params(syntheticContext)),
        (error) => {
          assert.equal(error.kind, kind);
          assert.ok(!JSON.stringify(error).includes("not-for-error"));
          return true;
        },
      );
      assert.equal(calls, 1);
    });
  test(`discovered abort ${entry.id}`, async () => {
    let calls = 0;
    const client = new FomoClient({
      session: new StaticSession({ accessToken: "fake" }),
      transport: {
        send: async () => {
          calls++;
        },
      },
    });
    await assert.rejects(
      callDiscovered(client, entry.operation, entry.params(syntheticContext), {
        signal: AbortSignal.abort(),
      }),
      { kind: "aborted" },
    );
    assert.equal(calls, 0);
  });
}
