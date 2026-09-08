import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { FomoClient, StaticSession, createImpitTransport } from "../dist/index.js";
import { Cassette, providerPolicy } from "../test/support/cassette.mjs";
import { methods, networks, invoke } from "../test/support/endpoint-matrix.mjs";
import { outcome, writeReport, isAccessFailure } from "../test/support/qualification.mjs";

// Discover chain-specific token inputs from a real read-only snapshot, never
// substitute synthetic addresses into the live matrix.
async function discoverTokens(accessToken) {
  const socket = new WebSocket("wss://prod-api.fomo.family/ws");
  try {
    return await new Promise((resolvePromise, reject) => {
      const timer = setTimeout(() => finish(new Error("Discovery deadline exceeded")), 12000);
      let done = false;
      function finish(error, tokens) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        error ? reject(error) : resolvePromise(tokens);
      }
      socket.addEventListener("error", () => finish(new Error("Discovery socket error")));
      socket.addEventListener("close", () => finish(new Error("Discovery closed")));
      socket.addEventListener("message", (event) => {
        try {
          const frame = JSON.parse(event.data);
          if (frame.type === "challenge")
            socket.send(JSON.stringify({ type: "challengeResponse", jwt: accessToken }));
          if (frame.type === "challengeAccepted")
            socket.send(
              JSON.stringify({
                type: "subscribe",
                topicType: "trending_tokens",
                topicId: networks.join(","),
              }),
            );
          if (
            frame.type === "data" &&
            frame.topicType === "trending_tokens" &&
            frame.payload?.kind === "snapshot"
          )
            finish(
              undefined,
              frame.payload.tokens
                .map((row) => row.token)
                .filter(
                  (token) =>
                    typeof token?.address === "string" && Number.isSafeInteger(token.networkId),
                ),
            );
        } catch {
          finish(new Error("Discovery malformed"));
        }
      });
    });
  } finally {
    socket.close();
  }
}
export async function qualify({
  accessToken,
  directory = resolve("test/fixtures/qualification"),
  reportFile = resolve("docs/qualification-results.json"),
}) {
  if (!accessToken) throw new Error("Explicit access token required");
  const report = {
    format: "sdk-qualification/v1",
    service: "fomo",
    capturedAt: new Date().toISOString(),
    scope: "Bounded native read-only samples, not full chain or refresh qualification.",
    cases: [],
  };
  const transport = createImpitTransport();
  const session = new StaticSession({ accessToken });
  async function run(id, name, args = [], variant = "sample") {
    if (!methods.includes(name)) throw new Error("Unknown read operation");
    const cassette = new Cassette({
      file: resolve(directory, `${id}.json`),
      policy: providerPolicy("fomo"),
      mode: "record",
      inputs: { args },
      provenance: { kind: "live", source: "SDK native read-only qualification", operation: name },
    });
    const client = new FomoClient({
      session,
      transport: cassette.transport(transport),
      maxRetries: 0,
      timeoutMs: 12000,
    });
    let result;
    const expected = await outcome(async () => {
      result = await invoke(client, name, args);
      return Array.isArray(result) ? result.map((page) => page.data) : result.data;
    });
    const recorded = !cassette.failed && cassette.data.exchanges.length > 0;
    if (recorded) {
      cassette.data.expected = expected;
      cassette.commit();
    }
    report.cases.push({
      id,
      operation: name,
      variant,
      status: expected.ok ? "passed" : "failed",
      recorded,
      ...expected,
    });
    writeReport(reportFile, report);
    console.log(
      JSON.stringify({
        id,
        status: expected.ok ? "passed" : "failed",
        recorded,
        ...(expected.error ? { error: expected.error } : {}),
      }),
    );
    if (isAccessFailure(expected.error, [401, 403, 429, 430, 431]))
      throw new Error("Access/rate-limit gate; stopped");
    await delay(600);
    return result;
  }
  const me = await run("current", "users.getCurrent");
  if (me?.data?.userHandle)
    await run("profile-self", "users.getByHandle", [{ handle: me.data.userHandle }]);
  let leaders;
  for (const window of ["24h", "7d", "30d", "all"])
    for (const limit of [1, 3]) {
      const result = await run(
        `leaderboard-${window}-${limit}`,
        "leaderboards.list",
        [{ window, limit }],
        `${window}/limit-${limit}`,
      );
      if (window === "24h" && limit === 3) leaders = result?.data;
    }
  if (leaders?.[0])
    await run("profile-other", "users.getByHandle", [{ handle: leaders[0].userHandle }]);
  for (const [tag, actor] of [
    ["self", me?.data],
    ["leader0", leaders?.[0]],
    ["leader1", leaders?.[1]],
  ]) {
    if (!actor?.id) continue;
    const first = await run(`swaps-${tag}`, "swaps.list", [{ userId: actor.id }]);
    if (first?.pageInfo.nextCursor)
      await run(
        `swaps-${tag}-next`,
        "swaps.list",
        [{ userId: actor.id, cursor: first.pageInfo.nextCursor }],
        "real-cursor",
      );
    await run(
      `pages-${tag}`,
      "swaps.pages",
      [{ userId: actor.id }, { maxPages: 2, maxItems: 30 }],
      "maxPages-2/maxItems-30",
    );
  }
  for (const limit of [1, 25]) {
    const first = await run(`activity-${limit}`, "activity.list", [{ limit }]);
    if (first?.pageInfo.nextCursor)
      await run(
        `activity-${limit}-next`,
        "activity.list",
        [{ limit, cursor: first.pageInfo.nextCursor }],
        "real-cursor",
      );
    else
      report.cases.push({
        id: `activity-${limit}-next`,
        operation: "activity.list",
        status: "not-run",
        recorded: false,
        reason: "no-valid-next-cursor",
      });
  }
  let discovered = [];
  try {
    discovered = await discoverTokens(accessToken);
  } catch {
    report.discovery = "failed";
  }
  for (const networkId of networks) {
    const tokens = discovered.filter((token) => token.networkId === networkId).slice(0, 2);
    if (!tokens.length) {
      for (const name of ["tokens.feed", "tokens.holders"])
        report.cases.push({
          id: `${networkId}-${name}`,
          operation: name,
          status: "not-run",
          recorded: false,
          reason: "no-token-in-live-snapshot",
        });
    }
    for (const [index, token] of tokens.entries()) {
      for (const [excludeThesis, threshold] of [
        [false, 0],
        [true, 100],
      ])
        await run(
          `feed-${networkId}-${index}-${excludeThesis}`,
          "tokens.feed",
          [{ token: { address: token.address, networkId }, excludeThesis, threshold }],
          `network-${networkId}/token-${index}/exclude-${excludeThesis}/threshold-${threshold}`,
        );
      await run(
        `holders-${networkId}-${index}`,
        "tokens.holders",
        [{ token: { address: token.address, networkId } }],
        `network-${networkId}/token-${index}`,
      );
    }
  }
  for (const [operation, reason] of [
    ["session.refresh", "true-expiry-and-rotation-not-qualified"],
    ["stream.activity", "real-events-and-lossless-gap-recovery-not-qualified"],
  ])
    report.cases.push({ id: operation, operation, status: "not-run", recorded: false, reason });
  writeReport(reportFile, report);
  return {
    cases: report.cases.length,
    passed: report.cases.filter((row) => row.status === "passed").length,
    failed: report.cases.filter((row) => row.status === "failed").length,
    notRun: report.cases.filter((row) => row.status === "not-run").length,
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.env.FOMO_QUALIFY !== "1") throw new Error("Qualification is opt-in");
    console.log(await qualify({ accessToken: process.env.FOMO_ACCESS_TOKEN }));
  } catch {
    console.error("Qualification stopped; inspect privately.");
    process.exitCode = 1;
  }
}
