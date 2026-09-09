import test from "node:test";
import assert from "node:assert/strict";
import { client, response, envelope } from "./helpers.mjs";
const token = { address: "mint", networkId: 56 };
test("metrics preserve missing/null, exact decimals, and returned order without manufacturing absent tokens", async () => {
  const raw =
    '{"success":true,"statusCode":200,"responseObject":[{"token":{"address":"mint","networkId":56,"decimals":18},"priceUSD":0.000000000000000000123,"marketCap":900719925474099312345,"liquidity":null,"holders":0}]}';
  const { client: c } = client(() => response(raw));
  const result = await c.tokens.metrics({ tokens: [token, { address: "missing", networkId: 56 }] });
  assert.equal(result.data.length, 1);
  assert.equal(result.data[0].priceUSD, "0.000000000000000000123");
  assert.equal(result.data[0].marketCap, "900719925474099312345");
  assert.equal(result.data[0].liquidity, null);
  assert.equal(result.data[0].volume24, undefined);
  assert.equal(result.data[0].holders, 0);
  assert.equal(result.data[0].token.decimals, 18);
});
test("bars normalize exact OHLC without zero-filling corrupt or missing prices", async () => {
  const raw =
    '{"success":true,"statusCode":200,"responseObject":{"t":[100],"o":[0.0000000000000001],"h":[2],"l":[1e-40],"c":[1.2300],"volume":["42.00"]}}';
  const { client: c } = client(() => response(raw));
  const result = await c.tokens.bars({ token, resolution: "1", from: 0, to: 100 });
  assert.deepEqual(result.data.bars, [
    {
      timestamp: 100,
      open: "0.0000000000000001",
      high: "2",
      low: "1e-40",
      close: "1.2300",
      volume: "42.00",
    },
  ]);
});
for (const data of [
  { t: [100], o: [1], h: [1], l: [], c: [1] },
  { t: [100], o: [1], h: [1], l: [1], c: [null] },
  { t: [100], o: [1], h: [1], l: [1], c: [1], v: [] },
  { t: [9007199254740992], o: [1], h: [1], l: [1], c: [1] },
])
  test(`malformed bars reject ${JSON.stringify(data)}`, async () => {
    const { client: c } = client(() => response(envelope(data)));
    await assert.rejects(c.tokens.bars({ token, resolution: "1", from: 0, to: 100 }), {
      kind: "protocol",
    });
  });
for (const data of [{ s: "no_data" }, { t: [], o: [], h: [], l: [], c: [] }])
  test(`empty bars ${JSON.stringify(data)}`, async () => {
    const { client: c } = client(() => response(envelope(data)));
    assert.deepEqual(
      (await c.tokens.recentBars({ token, resolution: "1", from: 0, to: 100, countBack: 5 })).data
        .bars,
      [],
    );
  });
const invalid = [
  (c) => c.market.list({ kind: "unexpected" }),
  (c) => c.market.search({ phrase: "x", tokenAddress: "y" }),
  (c) => c.market.search({}),
  (c) => c.market.search({ phrase: " " }),
  (c) => c.tokens.metrics({ tokens: [] }),
  (c) => c.tokens.metrics({ tokens: Array(101).fill(token) }),
  (c) => c.tokens.bars({ token, resolution: "bogus", from: 0, to: 100 }),
  (c) => c.tokens.bars({ token, resolution: "1", from: 101, to: 100 }),
  (c) => c.tokens.recentBars({ token, resolution: "1", from: 0, to: 100, countBack: 0 }),
  (c) => c.tokens.theses({ token, threshold: -1 }),
  (c) => c.tokens.friendHolders({ tokens: [], limit: 1 }),
  (c) => c.clans.leaderboard({ window: "never" }),
  (c) => c.clans.holdings({ clanId: " ", limit: 2 }),
  (c) => c.feed.list({ feedTypes: [] }),
  (c) => c.clans.feed({ clanId: "clan", feedTypes: [""] }),
  (c) => c.portfolio.history({ userId: "actor", since: "not-a-time" }),
  (c) => c.users.getMany({ userIds: [] }),
  (c) => c.users.getMany({ userIds: Array(101).fill("actor") }),
  (c) => c.activity.list({ minMarketCap: 100, maxMarketCap: 10 }),
];
for (const [i, run] of invalid.entries())
  test(`new parameter gate ${i}`, async () => {
    const { client: c, calls } = client(() => {
      throw new Error("unexpected network");
    });
    await assert.rejects(async () => run(c), { kind: "configuration" });
    assert.equal(calls.length, 0);
  });
test("token feed cursor and source aggregate feed types are passed explicitly", async () => {
  const { client: c, calls } = client((request) =>
    new URL(request.url).pathname === "/feed/token"
      ? response(
          envelope({
            items: [
              { id: "event", userId: null, type: "swap_buy", createdAt: "2026-09-09T00:00:00Z" },
            ],
            hasNextPage: true,
          }),
        )
      : response(envelope({ feed: [] })),
  );
  const result = await c.tokens.feed({ token, limit: 5, cursor: "prior/+==" });
  assert.equal(result.pageInfo.nextCursor, "event");
  assert.equal(new URL(calls[0].url).searchParams.get("lastId"), "prior/+==");
  await c.feed.list({ feedTypes: ["large_buy", "thesis_created"], cursor: "feed/+==" });
  assert.deepEqual(new URL(calls[1].url).searchParams.getAll("feedTypes"), [
    "large_buy",
    "thesis_created",
  ]);
  assert.equal(new URL(calls[1].url).searchParams.get("lastFeedId"), "feed/+==");
});
