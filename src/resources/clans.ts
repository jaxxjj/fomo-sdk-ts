import { FomoConnection, type RequestOptions, type ApiResult } from "../connection.js";
import { limit, identifier } from "../contracts/validation.js";
import { parsedResult, listResult, optionalId, windowValue } from "../contracts/read.js";
import {
  parseClan,
  parseClanHoldings,
  parseClanMember,
  type Clan,
  type ClanHoldings,
  type ClanMember,
} from "../contracts/clans.js";
import {
  parseFeedPage,
  parseThesisPage,
  type FeedPage,
  type ThesisPage,
} from "../contracts/feed.js";
import { tokenParams, type TokenRef } from "../contracts/models.js";
import { feedTypes } from "./feed.js";
function path(id: string) {
  return `/v2/clans/${encodeURIComponent(identifier(id, "clan_id"))}`;
}
export class ClansResource {
  constructor(private readonly connection: FomoConnection) {}
  /** Limit is sent upstream; the service has been observed returning more rows. */
  leaderboard(
    params: { window?: "24h" | "7d" | "30d" | "all"; limit?: number; cursor?: string } = {},
    options: RequestOptions = {},
  ): Promise<ApiResult<Clan[]>> {
    return listResult(
      this.connection.request(
        "clans.leaderboard",
        "/v2/clans/leaderboard",
        {
          window: windowValue(params.window),
          limit: limit(params.limit),
          cursor: optionalId(params.cursor, "cursor"),
        },
        options,
      ),
      parseClan,
      "leaderboard",
    );
  }
  search(params: { searchTerm: string }, options: RequestOptions = {}): Promise<ApiResult<Clan[]>> {
    return listResult(
      this.connection.request(
        "clans.search",
        "/v2/clans/search",
        { searchTerm: identifier(params.searchTerm, "search_term") },
        options,
      ),
      parseClan,
      "leaderboard",
    );
  }
  get(
    params: { clanId: string; window?: "24h" | "7d" | "30d" | "all" },
    options: RequestOptions = {},
  ): Promise<ApiResult<Clan>> {
    return parsedResult(
      this.connection.request(
        "clans.get",
        path(params.clanId),
        { window: windowValue(params.window) },
        options,
      ),
      parseClan,
    );
  }
  feed(
    params: { clanId: string; feedTypes: readonly string[]; limit?: number },
    options: RequestOptions = {},
  ): Promise<ApiResult<FeedPage>> {
    return parsedResult(
      this.connection.request(
        "clans.feed",
        `${path(params.clanId)}/feed`,
        { feedTypes: feedTypes(params.feedTypes), limit: limit(params.limit) },
        options,
      ),
      parseFeedPage,
    );
  }
  holdings(
    params: { clanId: string; limit?: number; cursor?: string },
    options: RequestOptions = {},
  ): Promise<ApiResult<ClanHoldings>> {
    return parsedResult(
      this.connection.request(
        "clans.holdings",
        `${path(params.clanId)}/holdings`,
        {
          limit: limit(params.limit),
          cursor: optionalId(params.cursor, "cursor"),
        },
        options,
      ),
      parseClanHoldings,
    );
  }
  holdingBreakdown(
    params: { clanId: string; token: TokenRef },
    options: RequestOptions = {},
  ): Promise<ApiResult<ClanMember[]>> {
    const token = tokenParams(params.token);
    this.connection.requireSupportedChains([token.networkId]);
    return listResult(
      this.connection.request(
        "clans.holdingBreakdown",
        `${path(params.clanId)}/holdings/breakdown`,
        token,
        options,
      ),
      parseClanMember,
      "members",
    );
  }
  theses(
    params: { clanId: string; limit?: number; cursor?: string },
    options: RequestOptions = {},
  ): Promise<ApiResult<ThesisPage>> {
    return parsedResult(
      this.connection.request(
        "clans.theses",
        `${path(params.clanId)}/thesis`,
        {
          limit: limit(params.limit),
          lastId: optionalId(params.cursor, "cursor"),
        },
        options,
      ),
      parseThesisPage,
    );
  }
}
