import { type RequestOptions, type ApiResult, FomoConnection } from "../connection.js";
import {
  type Page,
  type Activity,
  type HolderGroup,
  type TokenRef,
  parseActivity,
  parseHolderGroup,
  tokenParams,
} from "../contracts/models.js";
import { object, array, boolean, limit } from "../contracts/validation.js";
import { FomoError } from "../errors.js";
import {
  parseMetrics,
  parseBars,
  tokenBatch,
  tokenKey,
  type TokenMetrics,
  type BarSeries,
} from "../contracts/market.js";
import { parsedResult, optionalId, nonnegative } from "../contracts/read.js";
import {
  parseTokenDetails,
  parseTokenWarnings,
  type TokenDetails,
  type TokenWarnings,
} from "../contracts/token-details.js";
import { parseThesisPage, type ThesisPage } from "../contracts/feed.js";
import {
  parseDeveloperHolders,
  parseFriendHolders,
  type DeveloperHolders,
  type FriendHolders,
} from "../contracts/holders.js";
import { integer } from "../internal/async.js";
export interface TokenFeedParams {
  token: TokenRef;
  excludeThesis?: boolean;
  threshold?: number;
  limit?: number;
  cursor?: string;
}
export interface BarsParams {
  token: TokenRef;
  resolution: string;
  from: number;
  to: number;
}
function barsBody(params: BarsParams) {
  if (
    !["1S", "15S", "30S", "1", "5", "15", "30", "60", "240", "720", "1D", "7D"].includes(
      params.resolution,
    )
  )
    throw new FomoError("configuration", { reason: "bar_resolution" });
  const from = integer(params.from, 0, Number.MAX_SAFE_INTEGER, "bar_from");
  const to = integer(params.to, from, Number.MAX_SAFE_INTEGER, "bar_to");
  return { symbol: tokenKey(params.token), resolution: params.resolution, from, to };
}
export class TokensResource {
  constructor(private readonly connection: FomoConnection) {}
  #token(token: TokenRef) {
    const validated = tokenParams(token);
    this.connection.requireSupportedChains([validated.networkId]);
    return validated;
  }
  async feed(params: TokenFeedParams, options: RequestOptions = {}): Promise<Page<Activity>> {
    const token = this.#token(params.token);
    if (
      params.threshold !== undefined &&
      (!Number.isFinite(params.threshold) || params.threshold < 0)
    )
      throw new FomoError("configuration", { reason: "threshold" });
    if (params.excludeThesis !== undefined && typeof params.excludeThesis !== "boolean")
      throw new FomoError("configuration", { reason: "exclude_thesis" });
    const result = await this.connection.request(
      "tokens.feed",
      "/feed/token",
      {
        ...token,
        excludeThesis: params.excludeThesis ?? false,
        threshold: params.threshold ?? 0,
        limit: params.limit === undefined ? undefined : limit(params.limit),
        lastId: optionalId(params.cursor, "cursor"),
      },
      options,
    );
    const body = object(result.data, "token_feed");
    const data = array(body.items, "activities").map(parseActivity);
    const hasNextPage = boolean(body.hasNextPage, "has_next_page");
    if (hasNextPage && !data.length)
      throw new FomoError("pagination", {
        reason: "empty_nonterminal_page",
        operation: "tokens.feed",
      });
    return {
      ...result,
      data,
      pageInfo: {
        hasNextPage,
        nextCursor: hasNextPage ? data.at(-1)?.id : undefined,
        sourceCount: data.length,
      },
    };
  }
  async holders(
    params: { token: TokenRef },
    options: RequestOptions = {},
  ): Promise<ApiResult<HolderGroup[]>> {
    const token = this.#token(params.token);
    const result = await this.connection.request(
      "tokens.holders",
      "/hodlers/top",
      { tokens: JSON.stringify([{ address: token.tokenAddress, networkId: token.networkId }]) },
      options,
    );
    return { ...result, data: array(result.data, "holder_groups").map(parseHolderGroup) };
  }
  /** The upstream may omit tokens or reorder results; match returned token identities. */
  async metrics(
    params: { tokens: readonly TokenRef[] },
    options: RequestOptions = {},
  ): Promise<ApiResult<TokenMetrics[]>> {
    const keys = tokenBatch(params.tokens);
    this.connection.requireSupportedChains(params.tokens.map((token) => token.networkId));
    const result = await this.connection.readQuery("tokens.metrics", keys, options);
    return { ...result, data: array(result.data, "token_metrics").map(parseMetrics) };
  }
  /** Stable count fields are safe integers; money/ratios remain exact decimal text. */
  details(
    params: { token: TokenRef },
    options: RequestOptions = {},
  ): Promise<ApiResult<TokenDetails>> {
    this.#token(params.token);
    return parsedResult(
      this.connection.readQuery("tokens.details", { tokenId: tokenKey(params.token) }, options),
      parseTokenDetails,
    );
  }
  warnings(
    params: { token: TokenRef },
    options: RequestOptions = {},
  ): Promise<ApiResult<TokenWarnings>> {
    const token = this.#token(params.token);
    return parsedResult(
      this.connection.readQuery(
        "tokens.warnings",
        { address: token.tokenAddress, networkId: token.networkId },
        options,
      ),
      parseTokenWarnings,
    );
  }
  async bars(params: BarsParams, options: RequestOptions = {}): Promise<ApiResult<BarSeries>> {
    this.#token(params.token);
    const result = await this.connection.readQuery("tokens.bars", barsBody(params), options);
    return { ...result, data: parseBars(result.data) };
  }
  async recentBars(
    params: BarsParams & { countBack: number },
    options: RequestOptions = {},
  ): Promise<ApiResult<BarSeries>> {
    this.#token(params.token);
    const result = await this.connection.readQuery(
      "tokens.recentBars",
      {
        ...barsBody(params),
        countBack: integer(params.countBack, 1, 1500, "count_back"),
      },
      options,
    );
    return { ...result, data: parseBars(result.data) };
  }
  /** Captured thesis rows include structured comments and author-trade metrics. */
  theses(
    params: Omit<TokenFeedParams, "excludeThesis">,
    options: RequestOptions = {},
  ): Promise<ApiResult<ThesisPage>> {
    return parsedResult(
      this.connection.request(
        "tokens.theses",
        "/feed/token/thesis",
        {
          ...this.#token(params.token),
          limit: limit(params.limit),
          lastId: optionalId(params.cursor, "cursor"),
          threshold: nonnegative(params.threshold, "threshold"),
        },
        options,
      ),
      parseThesisPage,
    );
  }
  developerHolders(
    params: { token: TokenRef },
    options: RequestOptions = {},
  ): Promise<ApiResult<DeveloperHolders>> {
    return parsedResult(
      this.connection.request(
        "tokens.developerHolders",
        "/hodlers/devs",
        this.#token(params.token),
        options,
      ),
      parseDeveloperHolders,
    );
  }
  friendHolders(
    params: { tokens: readonly TokenRef[]; limit?: number },
    options: RequestOptions = {},
  ): Promise<ApiResult<FriendHolders>> {
    tokenBatch(params.tokens);
    const tokens = params.tokens.map((token) => {
      const value = this.#token(token);
      return { address: value.tokenAddress, networkId: value.networkId };
    });
    return parsedResult(
      this.connection.readQuery(
        "tokens.friendHolders",
        { tokens, limit: limit(params.limit ?? 2) },
        options,
      ),
      parseFriendHolders,
    );
  }
}
