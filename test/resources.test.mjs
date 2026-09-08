import test from "node:test";
import assert from "node:assert/strict";
import { client, response, envelope, user, swap, activity } from "./helpers.mjs";

test("financial numeric lexemes survive without IEEE754 rounding", async () => {
  const raw =
    '{"success":true,"statusCode":200,"responseObject":{"id":"self","userHandle":"test","totalVolume":900719925474099312345,"equity":0.123456789012345678901,"futureNumber":1e-40}}';
  const { client: c } = client(() => response(raw));
  const result = await c.users.getCurrent();
  assert.equal(result.data.totalVolume, "900719925474099312345");
  assert.equal(result.data.equity, "0.123456789012345678901");
  assert.equal(result.data.futureNumber, "1e-40");
  assert.equal(result.data.pnl24h, undefined);
});
test("unsafe numeric IDs/counts reject rather than round", async () => {
  const raw =
    '{"success":true,"statusCode":200,"responseObject":{"id":"self","userHandle":"test","followers":9007199254740993}}';
  await assert.rejects(client(() => response(raw)).client.users.getCurrent(), { kind: "protocol" });
});
test("handle is encoded and public profile lookup does not bind current account", async () => {
  const { client: c, calls } = client(() => response(envelope(user("other"))), {
    expectedAccountId: "self",
  });
  await c.users.getByHandle({ handle: "a/b?" });
  assert.equal(new URL(calls[0].url).pathname, "/v2/users/userHandle/a%2Fb%3F");
});
test("path segments cannot normalize into another endpoint", async () => {
  const { client: c, calls } = client(() => response(envelope(user())));
  await assert.rejects(c.users.getByHandle({ handle: ".." }), {
    kind: "configuration",
    reason: "normalized_request_path",
  });
  assert.equal(calls.length, 0);
});
test("leaderboard route/window/limit", async () => {
  const { client: c, calls } = client(() => response(envelope({ leaderboard: [user()] })));
  const result = await c.leaderboards.list({ window: "7d", limit: 3 });
  assert.equal(result.data.length, 1);
  assert.equal(new URL(calls[0].url).pathname, "/v2/leaderboard/7d");
  assert.equal(new URL(calls[0].url).searchParams.get("limit"), "3");
  await assert.rejects(c.leaderboards.list({ window: "unknown" }), { kind: "configuration" });
});
test("swaps expose opaque per-endpoint cursor and bounded end", async () => {
  const { client: c, calls } = client((_r, n) =>
    response(envelope({ swaps: [swap(`id-${n}`)], hasNextPage: n === 1 })),
  );
  const pages = [];
  for await (const page of c.swaps.pages({ userId: "u" })) pages.push(page);
  assert.equal(pages.length, 2);
  assert.equal(pages[1].pageInfo.stopReason, "end");
  assert.equal(new URL(calls[1].url).searchParams.get("lastSwapIdV2"), "id-1");
});
test("maxItems does not skip undelivered rows on resume", async () => {
  const { client: c } = client(() =>
    response(envelope({ swaps: [swap("a"), swap("b"), swap("c")], hasNextPage: true })),
  );
  const pages = [];
  for await (const page of c.swaps.pages({ userId: "u" }, { maxItems: 2 })) pages.push(page);
  assert.equal(pages[0].pageInfo.nextCursor, "b");
  assert.equal(pages[0].pageInfo.sourceCount, 3);
  assert.equal(pages[0].pageInfo.stopReason, "max_items");
});
test("maxPages is explicit truncation", async () => {
  const { client: c } = client(() => response(envelope({ swaps: [swap("a")], hasNextPage: true })));
  for await (const page of c.swaps.pages({ userId: "u" }, { maxPages: 1 }))
    assert.equal(page.pageInfo.stopReason, "max_pages");
});
test("repeated cursor fails instead of looping", async () => {
  const { client: c } = client(() =>
    response(envelope({ swaps: [swap("same")], hasNextPage: true })),
  );
  await assert.rejects(
    async () => {
      for await (const _ of c.swaps.pages({ userId: "u" })) {
      }
    },
    { kind: "pagination" },
  );
});
test("nonterminal empty swap pages reject; terminal empty pages are valid", async () => {
  await assert.rejects(
    client(() => response(envelope({ swaps: [], hasNextPage: true }))).client.swaps.list({
      userId: "u",
    }),
    { kind: "pagination" },
  );
  assert.deepEqual(
    (
      await client(() => response(envelope({ swaps: [], hasNextPage: false }))).client.swaps.list({
        userId: "u",
      })
    ).data,
    [],
  );
});
test("activity preserves thesis structure and transfer direction", async () => {
  const rows = [
    activity("a", "transfer_in"),
    activity("b", "transfer_out"),
    { ...activity("c", "thesis"), comment: { comment: "synthetic thesis", numLikes: 2 } },
    activity("d", "future_event"),
  ];
  const { client: c, calls } = client(() =>
    response(envelope({ items: rows, hasNextPage: false })),
  );
  const out = await c.activity.list({ limit: 4, cursor: "opaque/+==" });
  assert.deepEqual(
    out.data.map((x) => x.kind),
    ["transfer_in", "transfer_out", "thesis", "unknown"],
  );
  assert.equal(out.data[2].comment.comment, "synthetic thesis");
  assert.equal(new URL(calls[0].url).searchParams.get("lastId"), "opaque/+==");
});
test("token feed and holder protocols remain separate", async () => {
  const { client: c, calls } = client((request) =>
    new URL(request.url).pathname === "/feed/token"
      ? response(envelope({ items: [activity("a")], hasNextPage: false }))
      : response(
          envelope([
            {
              networkId: 56,
              tokenAddress: "mint",
              topHolders: [{ address: "wallet", value: 1.25 }],
              totalHolders: 10,
            },
          ]),
        ),
  );
  const token = { address: "mint", networkId: 56 };
  await c.tokens.feed({ token, excludeThesis: true, threshold: 100 });
  const holders = await c.tokens.holders({ token });
  assert.equal(holders.data[0].totalHolders, 10);
  assert.equal(holders.data[0].topHolders[0].value, "1.25");
  assert.deepEqual(JSON.parse(new URL(calls[1].url).searchParams.get("tokens")), [
    { address: "mint", networkId: 56 },
  ]);
  await assert.rejects(c.tokens.feed({ token: { ...token, networkId: NaN } }), {
    kind: "configuration",
  });
});
