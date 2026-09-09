import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { FomoClient, StaticSession, createImpitTransport } from "../dist/index.js";
import { Cassette, providerPolicy } from "../test/support/cassette.mjs";
import { discoveredCases, callDiscovered } from "../test/support/discovered-cases.mjs";
import { outcome, writeReport, isAccessFailure } from "../test/support/qualification.mjs";
import { readFileSync } from "node:fs";
export async function qualifyDiscovered(accessToken, only) {
  if (!accessToken) throw new Error("Explicit token required");
  const session = new StaticSession({ accessToken });
  const transport = createImpitTransport();
  const bootstrap = new FomoClient({ session, transport, maxRetries: 0 });
  const me = await bootstrap.users.getCurrent();
  const clans = await bootstrap.clans.leaderboard({ window: "24h", limit: 2 });
  const context = {
    userId: me.data.id,
    clanId: clans.data[0].id,
    from: Math.floor(Date.now() / 1000) - 600,
    to: Math.floor(Date.now() / 1000),
    token: { address: "0x39dbed3a2bd333467115de45665cc57f813c4571", networkId: 4663 },
    secondToken: { address: "cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij", networkId: 1399811149 },
  };
  const history = await bootstrap.portfolio.historyAll({ userId: me.data.id });
  const thesis = await bootstrap.tokens.theses({ token: context.token, limit: 1 });
  context.snapshotId = history.data[0]?.snapshotId;
  context.tradeId = thesis.data.items?.[0]?.tradeId;
  if (typeof context.snapshotId !== "string" || typeof context.tradeId !== "string")
    throw new Error("No observed snapshot/trade IDs");
  const report = only
    ? JSON.parse(readFileSync(resolve("docs/discovered-qualification.json"), "utf8"))
    : {
        source: "Fomo first-party website manifest-233aac45.js",
        startedAt: new Date().toISOString(),
        cases: [],
      };
  for (const entry of discoveredCases) {
    if (only && !only.includes(entry.id)) continue;
    const params = entry.params(context);
    const cassette = new Cassette({
      file: resolve(`test/fixtures/discovered/${entry.id}.json`),
      policy: providerPolicy("fomo"),
      mode: "record",
      inputs: { params },
      provenance: {
        kind: "live",
        source: "SDK native read-only website capability qualification",
        operation: entry.operation,
      },
    });
    const client = new FomoClient({
      session,
      transport: cassette.transport(transport),
      maxRetries: 0,
      timeoutMs: 15000,
    });
    const expected = await outcome(
      async () => (await callDiscovered(client, entry.operation, params)).data,
    );
    const recorded = !cassette.failed && cassette.data.exchanges.length > 0;
    if (recorded) {
      cassette.data.expected = expected;
      cassette.commit();
    }
    report.cases = report.cases.filter((row) => row.id !== entry.id);
    report.cases.push({
      id: entry.id,
      operation: entry.operation,
      recorded,
      ...expected,
      ...(cassette.failed ? { captureFailure: cassette.failure } : {}),
    });
    report.cases.sort(
      (a, b) =>
        discoveredCases.findIndex((x) => x.id === a.id) -
        discoveredCases.findIndex((x) => x.id === b.id),
    );
    writeReport(resolve("docs/discovered-qualification.json"), report);
    console.log(JSON.stringify(report.cases.at(-1)));
    if (isAccessFailure(expected.error, [401, 403, 429, 430, 431]))
      throw new Error("Access/rate gate");
    await delay(1500);
  }
  return { cases: report.cases.length, passed: report.cases.filter((row) => row.ok).length };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.env.FOMO_QUALIFY !== "1") throw new Error("Explicit opt-in required");
    console.log(await qualifyDiscovered(process.env.FOMO_ACCESS_TOKEN));
  } catch {
    console.error("Discovered qualification stopped; inspect privately.");
    process.exitCode = 1;
  }
}
