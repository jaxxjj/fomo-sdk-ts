import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { FomoClient, StaticSession, createImpitTransport } from "../dist/index.js";
import { Cassette, providerPolicy } from "../test/support/cassette.mjs";
import { scenarios } from "../test/support/scenarios.mjs";

// Importable for an explicitly authorized, in-memory credential handoff.
// Never discovers credentials in browsers, files or keychains.
export async function recordScenario({ scenario, accessToken, inputs = {}, directory }) {
  if (!Object.hasOwn(scenarios, scenario) || !accessToken || !directory)
    throw new Error("Explicit scenario, credentials and output directory required");
  const cassette = new Cassette({
    file: resolve(directory, `${scenario}.json`),
    policy: providerPolicy("fomo"),
    mode: "record",
    provenance: { kind: "live", source: "Fomo HTTP via SDK Impit transport", scenario },
    inputs,
  });
  const client = new FomoClient({
    session: new StaticSession({ accessToken }),
    transport: cassette.transport(createImpitTransport()),
    maxRetries: 0,
    timeoutMs: 15_000,
  });
  await scenarios[scenario](client, inputs);
  cassette.commit();
  return { scenario, exchanges: cassette.data.exchanges.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.env.FOMO_RECORD !== "1") throw new Error("Recording is opt-in");
    const inputs = JSON.parse(process.env.FOMO_RECORD_INPUTS ?? "{}");
    console.log(
      await recordScenario({
        scenario: process.argv[2],
        accessToken: process.env.FOMO_ACCESS_TOKEN,
        inputs,
        directory: new URL("../test/fixtures/http/", import.meta.url).pathname,
      }),
    );
  } catch {
    console.error("Recording failed; no successful cassette committed. Inspect privately.");
    process.exitCode = 1;
  }
}
