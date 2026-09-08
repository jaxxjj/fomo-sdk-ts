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
    const scenario = cassette.data.provenance.scenario;
    assert.ok(Object.hasOwn(scenarios, scenario), "Unknown fixture scenario");
    if (scenario === "activity-rejected") {
      const raw = JSON.parse(cassette.data.exchanges[0].response.body);
      assert.ok(raw.responseObject.items.some((row) => row.userId === null));
    }
    const client = new FomoClient({
      session: new StaticSession({ accessToken: "offline-placeholder" }),
      transport: cassette.transport(),
      maxRetries: 0,
    });
    await scenarios[scenario](client, cassette.fixtureInputs);
    cassette.assertConsumed();
  });
}
