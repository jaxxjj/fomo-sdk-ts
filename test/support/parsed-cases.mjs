import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { FomoClient, StaticSession } from "../../dist/index.js";
import { Cassette, providerPolicy } from "./cassette.mjs";
import { invoke } from "./endpoint-matrix.mjs";
import { callDiscovered } from "./discovered-cases.mjs";
export function parsedCases() {
  return ["discovered", "qualification", "typed"].flatMap((group) =>
    readdirSync(new URL(`../fixtures/${group}/`, import.meta.url))
      .filter((name) => name.endsWith(".json"))
      .sort()
      .map((name) => {
        const file = new URL(`../fixtures/${group}/${name}`, import.meta.url);
        const text = readFileSync(file, "utf8");
        const fixture = JSON.parse(text);
        return {
          id: `${group}-${name}`,
          file,
          group,
          fixture,
          sha256: createHash("sha256").update(text).digest("hex"),
        };
      }),
  );
}
export async function replayParsed(entry) {
  const cassette = new Cassette({ file: entry.file, policy: providerPolicy("fomo") });
  const header = cassette.data.exchanges[0].request.headers["x-supported-chains"];
  const client = new FomoClient({
    session: new StaticSession({ accessToken: "offline-only" }),
    supportedChains: header ?? null,
    transport: cassette.transport(),
    maxRetries: 0,
  });
  const operation = cassette.data.provenance.operation;
  const result =
    entry.group !== "qualification"
      ? await callDiscovered(client, operation, cassette.fixtureInputs.params)
      : await invoke(client, operation, cassette.fixtureInputs.args);
  cassette.assertConsumed();
  const payload = (result) => ({
    data: result.data,
    ...(result.pageInfo ? { pageInfo: result.pageInfo } : {}),
  });
  // Serialize absence consistently, but never convert null, decimals, IDs or timestamps.
  return JSON.parse(JSON.stringify(Array.isArray(result) ? result.map(payload) : payload(result)));
}
