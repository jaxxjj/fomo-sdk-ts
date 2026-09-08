import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { FomoClient, StaticSession } from "../dist/index.js";
import { Cassette, providerPolicy } from "./support/cassette.mjs";
import { scenarios } from "./support/scenarios.mjs";

const directory = new URL("./fixtures/http/", import.meta.url);
const files = readdirSync(directory).filter((name) => name.endsWith(".json"));
for (const required of ["current", "leaderboard", "swaps", "token", "activity-rejected"]) {
  assert.ok(files.includes(`${required}.json`), `Missing required ${required} fixture`);
}
for (const file of files) {
  test(`HTTP contract replay: ${file}`, async () => {
    const cassette = new Cassette({
      file: new URL(file, directory),
      policy: providerPolicy("fomo"),
    });
    const capturedScenario = cassette.data.provenance.scenario;
    // Keep the original capture and its historical name; the current SDK must
    // now accept every row without dropping unattributed activity.
    const scenario = capturedScenario === "activity-rejected" ? "activity" : capturedScenario;
    assert.ok(Object.hasOwn(scenarios, scenario), "Unknown fixture scenario");
    if (capturedScenario === "activity-rejected") {
      const raw = JSON.parse(cassette.data.exchanges[0].response.body);
      assert.ok(raw.responseObject.items.some((row) => row.userId === null));
    }
    const client = new FomoClient({
      session: new StaticSession({ accessToken: "offline-placeholder" }),
      transport: cassette.transport(),
      maxRetries: 0,
    });
    const result = await scenarios[scenario](client, cassette.fixtureInputs);
    if (capturedScenario === "activity-rejected") {
      const wire = JSON.parse(cassette.data.exchanges[0].response.body).responseObject.items;
      assert.equal(result.data.length, wire.length);
      assert.deepEqual(
        result.data.map((row) => row.userId),
        wire.map((row) => row.userId),
      );
    }
    cassette.assertConsumed();
  });
}
