// Independent website-derived operation inventory. Not generated from SDK methods.
const token = (c) => c.token;
const user = (c) => ({ userId: c.userId });
const clan = (c) => ({ clanId: c.clanId });
const entry = (id, operation, params) => ({ id, operation, params });
export const discoveredCases = [
  ...["trending", "mostHeld", "graduated", "crypto", "verified"].map((kind) =>
    entry(`market-${kind}`, "market.list", () => ({ kind })),
  ),
  entry("search-phrase", "market.search", () => ({ phrase: "PONS" })),
  entry("search-address", "market.search", (c) => ({ tokenAddress: c.token.address })),
  entry("metrics-batch", "tokens.metrics", (c) => ({ tokens: [c.token, c.secondToken] })),
  entry("details", "tokens.details", (c) => ({ token: token(c) })),
  entry("warnings", "tokens.warnings", (c) => ({ token: token(c) })),
  entry("bars", "tokens.bars", (c) => ({
    token: token(c),
    resolution: "1",
    from: c.from,
    to: c.to,
  })),
  entry("recent-bars", "tokens.recentBars", (c) => ({
    token: token(c),
    resolution: "1",
    from: c.from,
    to: c.to,
    countBack: 5,
  })),
  entry("theses", "tokens.theses", (c) => ({ token: token(c), limit: 5, threshold: 0 })),
  entry("developer-holders", "tokens.developerHolders", (c) => ({ token: token(c) })),
  entry("friend-holders", "tokens.friendHolders", (c) => ({
    tokens: [c.token, c.secondToken],
    limit: 2,
  })),
  entry("user-by-id", "users.getById", user),
  entry("users-search", "users.search", () => ({ searchTerm: "unipcs" })),
  entry("following-ids", "users.followingIds", () => undefined),
  entry("followers", "users.followers", user),
  entry("following", "users.following", user),
  entry("mutuals", "users.mutuals", user),
  entry("recommended", "users.recommended", user),
  entry("following-leaderboard", "leaderboards.following", () => undefined),
  entry("balances", "portfolio.balances", user),
  entry("portfolio-history", "portfolio.history", (c) => ({
    ...user(c),
    since: new Date(c.from * 1000).toISOString(),
  })),
  entry("portfolio-history-all", "portfolio.historyAll", user),
  entry("trades", "trades.list", user),
  entry("watchlist", "watchlist.list", () => undefined),
  entry("feed", "feed.list", () => ({ feedTypes: ["thesis_created", "large_buy"], limit: 5 })),
  entry("clan-leaderboard", "clans.leaderboard", () => ({ window: "24h", limit: 2 })),
  entry("clan-search", "clans.search", () => ({ searchTerm: "Fantom" })),
  entry("clan-get", "clans.get", (c) => ({ ...clan(c), window: "24h" })),
  entry("clan-feed", "clans.feed", (c) => ({
    ...clan(c),
    feedTypes: ["thesis_created", "large_buy"],
    limit: 5,
  })),
  entry("clan-holdings", "clans.holdings", (c) => ({ ...clan(c), limit: 2 })),
  entry("clan-holding-breakdown", "clans.holdingBreakdown", (c) => ({
    ...clan(c),
    token: token(c),
  })),
  entry("clan-theses", "clans.theses", (c) => ({ ...clan(c), limit: 5 })),
  entry("filtered-activity", "activity.list", () => ({
    limit: 5,
    threshold: 100,
    minEquity: 0,
    minMarketCap: 0,
    maxMarketCap: 1e12,
  })),
  entry("filtered-token-feed", "tokens.feed", (c) => ({
    token: token(c),
    limit: 5,
    excludeThesis: true,
    threshold: 0,
  })),
  entry("filtered-swaps", "swaps.list", (c) => ({ ...user(c), tokenAddress: c.token.address })),
  entry("allowlist", "market.allowlist", () => undefined),
  entry("configuration", "app.configuration", () => undefined),
  entry("users-batch", "users.getMany", (c) => ({ userIds: [c.userId] })),
  entry("portfolio-snapshot", "portfolio.snapshot", (c) => ({
    ...user(c),
    snapshotId: c.snapshotId,
  })),
  entry("trade", "trades.get", (c) => ({ tradeId: c.tradeId })),
  entry("trade-comments", "trades.comments", (c) => ({ tradeId: c.tradeId })),
];
export async function callDiscovered(client, operation, params, options) {
  const [resource, method] = operation.split(".");
  return params === undefined
    ? client[resource][method](options)
    : client[resource][method](params, options);
}
export const syntheticContext = {
  userId: "fixture-user",
  clanId: "fixture-clan",
  from: 1788825600,
  to: 1788826200,
  snapshotId: "1788825600",
  tradeId: "fixture-trade",
  token: { address: "0x0000000000000000000000000000000000000001", networkId: 4663 },
  secondToken: { address: "11111111111111111111111111111112", networkId: 1399811149 },
};
