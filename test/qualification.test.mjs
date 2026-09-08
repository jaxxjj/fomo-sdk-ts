import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FomoClient, StaticSession } from "../dist/index.js";
import { Cassette, providerPolicy } from "./support/cassette.mjs";
import { outcome } from "./support/qualification.mjs";
import { methods, invoke } from "./support/endpoint-matrix.mjs";
const report = JSON.parse(
  readFileSync(new URL("../docs/qualification-results.json", import.meta.url), "utf8"),
);
test("qualification ledger inventories every resource method", () => {
  assert.equal(report.service, "fomo");
  assert.equal(new Set(report.cases.map((row) => row.id)).size, report.cases.length);
  for (const name of methods)
    assert.ok(
      report.cases.some((row) => row.operation === name),
      name,
    );
  for (const row of report.cases) {
    assert.ok(["passed", "failed", "not-run"].includes(row.status));
    if (row.status === "passed") assert.ok(row.recorded);
  }
});
for (const row of report.cases.filter((entry) => entry.recorded))
  test(`live evidence replay ${row.id} [${row.status}]`, async () => {
    const cassette = new Cassette({
      file: new URL(`./fixtures/qualification/${row.id}.json`, import.meta.url),
      policy: providerPolicy("fomo"),
    });
    assert.equal(cassette.data.provenance.operation, row.operation);
    const client = new FomoClient({
      session: new StaticSession({ accessToken: "offline-placeholder" }),
      maxRetries: 0,
      transport: cassette.transport(),
    });
    const actual = await outcome(async () => {
      const result = await invoke(client, row.operation, cassette.fixtureInputs.args);
      return Array.isArray(result) ? result.map((page) => page.data) : result.data;
    });
    assert.deepEqual(actual, cassette.data.expected);
    assert.equal(actual.ok, row.status === "passed");
    cassette.assertConsumed();
  });
