/** First-party read-only POST routes. No generic POST/execution escape hatch. */
export const READ_QUERIES = {
  "market.trending": "/proxy/trendingTokens",
  "market.mostHeld": "/proxy/mostHeld",
  "market.graduated": "/proxy/graduatedTokens",
  "market.crypto": "/proxy/cryptoTokens",
  "market.search": "/proxy/filterTokensSearch",
  "tokens.metrics": "/proxy/filterTokens",
  "tokens.details": "/proxy/tokenDetails",
  "tokens.warnings": "/proxy/tokenWarnings",
  "tokens.bars": "/proxy/getBars",
  "tokens.recentBars": "/proxy/getBarsNew",
  "tokens.friendHolders": "/hodlers/friends",
} as const;
export type ReadQueryOperation = keyof typeof READ_QUERIES;
