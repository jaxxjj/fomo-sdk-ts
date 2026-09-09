import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse, isLosslessNumber } from "lossless-json";
import { decodeJson } from "../dist/http/response.js";
import { parseTokenDetails, parseTokenWarnings } from "../dist/contracts/token-details.js";
import { parseBalances, parsePortfolioSnapshot } from "../dist/contracts/portfolio.js";
import { parseClan, parseClanHoldings } from "../dist/contracts/clans.js";
import { parseTradeDetail } from "../dist/contracts/trades.js";
import { parseCommentPage } from "../dist/contracts/comments.js";
import { parseThesisPage, parseFeedPage } from "../dist/contracts/feed.js";
import { parseConfiguration, parseAllowlist } from "../dist/contracts/configuration.js";
import { parseDeveloperHolders } from "../dist/contracts/holders.js";
const specs = [
  [
    "details",
    parseTokenDetails,
    ["holders", "buyCount24"],
    ["buyVolume24", "top10HoldersPercent"],
    ["isLowFees"],
  ],
  [
    "warnings",
    parseTokenWarnings,
    ["warnings.0.priority"],
    [],
    ["disableBuying", "disableSelling"],
  ],
  ["balances", parseBalances, [], ["otherPnl", "otherEquity"], []],
  ["portfolio-snapshot", parsePortfolioSnapshot, [], ["equity", "pnl"], []],
  [
    "clan-get",
    parseClan,
    ["rank", "memberCount", "tradeCount", "members.0.user.followers"],
    ["pnl", "members.0.pnl", "topTokens.0.pnl"],
    ["viewerHasPendingInvite"],
  ],
  [
    "clan-holdings",
    parseClanHoldings,
    ["totalCount", "holdings.0.memberCount"],
    ["holdings.0.value"],
    ["hasNextPage"],
  ],
  [
    "trade",
    parseTradeDetail,
    ["trade.networkId", "comment.numLikes"],
    ["trade.avgEntryPrice", "trade.tokenMetadata.currentPrice", "swaps.0.inAmount"],
    ["verified"],
  ],
  [
    "trade-comments",
    parseCommentPage,
    ["comments.0.numLikes", "comments.0.reactions.counts.likeCount"],
    [],
    ["hasNextPage", "comments.0.reactions.reactions.like"],
  ],
  [
    "theses",
    parseThesisPage,
    ["count", "items.0.numReplies"],
    ["items.0.authorTrade.usdValue"],
    ["hasNextPage"],
  ],
  ["feed", parseFeedPage, ["feed.0.likes", "feed.0.views"], [], ["feed.0.pinned"]],
  [
    "developer-holders",
    parseDeveloperHolders,
    ["networkId", "devHoldings.0.user.following", "devHoldings.0.numReplies"],
    ["devHoldings.0.value"],
    ["devHoldings.0.isDev"],
  ],
  [
    "configuration",
    parseConfiguration,
    ["transferMessageMaxLength"],
    ["crossmint.minimumAmount"],
    ["simulateBeforeSend"],
  ],
  ["allowlist", parseAllowlist, ["tokens.0.networkId"], [], ["tokens.0.isLowFees"]],
  [
    "verified-active-balances",
    parseBalances,
    ["balances.0.userToken.networkId"],
    ["balances.0.balance.balance", "balances.0.userToken.currentCostBasisUsd"],
    ["balances.0.valuation.includeInEquity"],
    "typed",
  ],
  [
    "verified-active-trade-detail",
    parseTradeDetail,
    ["transfers.0.networkId"],
    ["transfers.0.usdAmount", "transfers.0.tokenAmountString"],
    ["transfers.0.isCrossmint"],
    "typed",
  ],
];
const get = (value, path) => path.split(".").reduce((x, key) => x[key], value);
function put(value, path, replacement) {
  const keys = path.split(".");
  const parent = keys.slice(0, -1).reduce((x, key) => x[key], value);
  parent[keys.at(-1)] = replacement;
}
for (const [id, parser, counts, amounts, flags, group = "discovered"] of specs) {
  const fixture = JSON.parse(
    readFileSync(new URL(`./fixtures/${group}/${id}.json`, import.meta.url), "utf8"),
  );
  const text = fixture.exchanges[0].response.body;
  const wire = parse(text).responseObject;
  const input = decodeJson(text).responseObject;
  test(`field oracle independent of parser: ${id}`, () => {
    const result = parser(input);
    for (const path of counts) {
      const source = get(wire, path);
      assert.ok(isLosslessNumber(source));
      assert.equal(get(result, path), Number(source.value));
    }
    for (const path of amounts) {
      const source = get(wire, path);
      assert.equal(get(result, path), isLosslessNumber(source) ? source.value : source);
    }
    for (const path of flags) assert.equal(get(result, path), get(wire, path));
    assert.deepEqual(
      parser({ ...input, futureExtension: { decimal: "1.2300", flag: null } }).futureExtension,
      { decimal: "1.2300", flag: null },
    );
  });
  for (const path of [...counts, ...amounts, ...flags])
    test(`wrong known field rejects: ${id}/${path}`, () => {
      const broken = structuredClone(input);
      put(broken, path, { unexpected: true });
      assert.throws(() => parser(broken), { kind: "protocol" });
    });
}
test("optional detail fields preserve absence/null/zero and reject unsafe counts", () => {
  assert.equal(Object.hasOwn(parseTokenDetails({}), "holders"), false);
  assert.equal(parseTokenDetails({ holders: null }).holders, null);
  assert.equal(parseTokenDetails({ holders: "0" }).holders, 0);
  for (const holders of ["1.5", "9007199254740993", "-1", false])
    assert.throws(() => parseTokenDetails({ holders }), { kind: "protocol" });
});
