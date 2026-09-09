import test from "node:test";
import assert from "node:assert/strict";
import { parseConfiguration, parseWatchlistEntry } from "../dist/contracts/configuration.js";
import { parseUser } from "../dist/contracts/users.js";
import { parseComment } from "../dist/contracts/comments.js";
import { parseTokenWarnings } from "../dist/contracts/token-details.js";
import { parseThesisPage, parseFeedPage } from "../dist/contracts/feed.js";
import { parseTradeDetail, parseTradesPage } from "../dist/contracts/trades.js";
import { parseBalances } from "../dist/contracts/portfolio.js";
import { parseClanHoldings } from "../dist/contracts/clans.js";
test("known optional fields preserve absent/null without zero defaults", () => {
  const user = parseUser({
    id: "u",
    userHandle: "name",
    followers: null,
    verified: false,
    futureCount: "90071992547409930",
  });
  assert.equal(Object.hasOwn(user, "equity"), false);
  assert.equal(user.followers, null);
  assert.equal(user.verified, false);
  assert.equal(user.futureCount, "90071992547409930");
  const comment = parseComment({ comment: "", parentId: null });
  assert.equal(comment.comment, "");
  assert.equal(comment.parentId, null);
  assert.equal(Object.hasOwn(comment, "numLikes"), false);
});
test("future application feature shape remains an extension, not a forced boolean", () => {
  const config = parseConfiguration({
    features: { perpsTrading: false, futureMode: { choice: "a" } },
    perpsFeeTierDbps: null,
  });
  assert.equal(config.features.perpsTrading, false);
  assert.deepEqual(config.features.futureMode, { choice: "a" });
  assert.equal(config.perpsFeeTierDbps, null);
});
test("watchlist identity and created time are checked", () => {
  assert.equal(
    parseWatchlistEntry({ tokenAddress: "mint", networkId: "56", createdAt: null }).networkId,
    56,
  );
  assert.throws(() => parseWatchlistEntry({ tokenAddress: "mint", networkId: "bad" }), {
    kind: "protocol",
  });
});
for (const [name, parser] of [
  ["warnings", parseTokenWarnings],
  ["theses", parseThesisPage],
  ["feed", parseFeedPage],
  ["trade", parseTradeDetail],
  ["trades", parseTradesPage],
  ["balances", parseBalances],
  ["clan-holdings", parseClanHoldings],
])
  for (const payload of [null, [], {}, false])
    test(`${name} malformed required envelope ${JSON.stringify(payload)}`, () => {
      assert.throws(() => parser(payload), { kind: "protocol" });
    });
