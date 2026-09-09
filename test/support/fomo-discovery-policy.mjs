// Recording allowlist independent of production's read-query allowlist.
export const discoveredPosts = [
  "/proxy/trendingTokens",
  "/proxy/mostHeld",
  "/proxy/graduatedTokens",
  "/proxy/cryptoTokens",
  "/proxy/filterTokensSearch",
  "/proxy/filterTokens",
  "/proxy/tokenDetails",
  "/proxy/tokenWarnings",
  "/proxy/getBars",
  "/proxy/getBarsNew",
  "/hodlers/friends",
];
export function allowDiscoveredRead(method, path) {
  if (method === "POST") return discoveredPosts.includes(path);
  if (method !== "GET") return false;
  return (
    [
      "/proxy/verifiedTokens",
      "/watchlist",
      "/feed",
      "/trades",
      "/feed/token/thesis",
      "/hodlers/devs",
      "/config",
      "/tokenAllowList/detailed",
      "/v2/users/current/followingIds",
      "/v2/leaderboard/following",
      "/v2/users/fuzzy-search",
      "/v2/userTokens/aggregatedSnapshot",
      "/v2/userTokens/aggregatedSnapshot/interval",
      "/v2/userTokens/aggregatedSnapshotById",
      "/v2/users",
      "/v2/clans/leaderboard",
      "/v2/clans/search",
    ].includes(path) ||
    /^\/trades\/[^/]+(?:\/comments)?$/.test(path) ||
    /^\/v2\/users\/[^/]+(?:\/(?:followers|followingPaginate|mutuals|recommendedUsers|balances))?$/.test(
      path,
    ) ||
    /^\/v2\/clans\/[^/]+(?:\/(?:feed|holdings|holdings\/breakdown|thesis))?$/.test(path)
  );
}
