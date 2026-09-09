import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import assert from "node:assert/strict";
import { FomoClient, StaticSession, createImpitTransport } from "../dist/index.js";
import { Cassette, providerPolicy } from "../test/support/cassette.mjs";
import { outcome, writeReport, isAccessFailure } from "../test/support/qualification.mjs";
import { callDiscovered } from "../test/support/discovered-cases.mjs";
import { existsSync, readFileSync } from "node:fs";
export async function qualifyTyped(accessToken, prefix = "") {
  const session = new StaticSession({ accessToken });
  const transport = createImpitTransport();
  const reportFile = resolve("docs/typed-qualification.json");
  const results =
    prefix && existsSync(reportFile) ? JSON.parse(readFileSync(reportFile, "utf8")) : [];
  async function run(id, operation, params, { supportedChains, validate } = {}) {
    id = prefix ? `${prefix}-${id}` : id;
    const cassette = new Cassette({
      file: resolve(`test/fixtures/typed/${id}.json`),
      policy: providerPolicy("fomo"),
      mode: "record",
      inputs: { params },
      provenance: { kind: "live", source: "Typed SDK with corrected chain scope", operation },
    });
    const client = new FomoClient({
      session,
      transport: cassette.transport(transport),
      maxRetries: 0,
      ...(supportedChains ? { supportedChains } : {}),
    });
    let data;
    const expected = await outcome(async () => {
      data = (await callDiscovered(client, operation, params)).data;
      return data;
    });
    if (expected.ok && validate) validate(data);
    if (!cassette.failed && cassette.data.exchanges.length) {
      cassette.data.expected = expected;
      cassette.commit();
    }
    results.push({
      id,
      operation,
      ...expected,
      recorded: !cassette.failed && cassette.data.exchanges.length > 0,
      ...(cassette.failed ? { captureFailure: cassette.failure } : {}),
    });
    writeReport(reportFile, results);
    console.log(JSON.stringify(results.at(-1)));
    await delay(1500);
    if (isAccessFailure(expected.error, [401, 403, 429, 430, 431])) throw new Error("Access gate");
    return data;
  }
  const p = { address: "0x39dbed3a2bd333467115de45665cc57f813c4571", networkId: 4663 };
  const b = { address: "cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij", networkId: 1399811149 };
  const key = (t) => `${t.address}:${t.networkId}`;
  await run(
    "cross-chain-metrics",
    "tokens.metrics",
    { tokens: [p, b] },
    {
      validate: (data) => {
        assert.deepEqual(data.map((x) => key(x.token)).sort(), [key(p), key(b)].sort());
      },
    },
  );
  await run(
    "narrow-metrics",
    "tokens.metrics",
    { tokens: [p] },
    {
      supportedChains: "4663",
      validate: (data) => {
        assert.deepEqual(
          data.map((x) => key(x.token)),
          [key(p)],
        );
      },
    },
  );
  const profile = await run("active-profile", "users.getByHandle", { handle: "unipcs" });
  if (profile) {
    await run("active-balances", "portfolio.balances", { userId: profile.id });
    const page = await run("active-trades", "trades.list", { userId: profile.id });
    const tradeId = page?.closedTrades?.[0]?.trade?.id ?? page?.activeTrades?.[0]?.trade?.id;
    if (tradeId) await run("active-trade-detail", "trades.get", { tradeId });
  }
  return results;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.env.FOMO_QUALIFY !== "1") throw new Error("Explicit opt-in required");
    await qualifyTyped(process.env.FOMO_ACCESS_TOKEN);
  } catch {
    console.error("Typed qualification stopped; inspect privately.");
    process.exitCode = 1;
  }
}
