import { FomoConnection, type RequestOptions, type ApiResult } from "../connection.js";
import { parseMetrics, type TokenMetrics } from "../contracts/market.js";
import { array, identifier } from "../contracts/validation.js";
import { FomoError } from "../errors.js";
import { parsedResult } from "../contracts/read.js";
import { parseAllowlist, type TokenAllowlist } from "../contracts/configuration.js";
const operations = {
  trending: "market.trending",
  mostHeld: "market.mostHeld",
  graduated: "market.graduated",
  crypto: "market.crypto",
} as const;
export type MarketList = keyof typeof operations | "verified";
export type MarketSearch =
  { phrase: string; tokenAddress?: never } | { tokenAddress: string; phrase?: never };
export class MarketResource {
  constructor(private readonly connection: FomoConnection) {}
  async list(
    params: { kind: MarketList },
    options: RequestOptions = {},
  ): Promise<ApiResult<TokenMetrics[]>> {
    if (!params || (params.kind !== "verified" && !Object.hasOwn(operations, params.kind)))
      throw new FomoError("configuration", { reason: "market_list" });
    const result =
      params.kind === "verified"
        ? await this.connection.request("market.verified", "/proxy/verifiedTokens", {}, options)
        : await this.connection.readQuery(operations[params.kind], undefined, options);
    return { ...result, data: array(result.data, "market_tokens").map(parseMetrics) };
  }
  async search(
    params: MarketSearch,
    options: RequestOptions = {},
  ): Promise<ApiResult<TokenMetrics[]>> {
    if (!params || Object.hasOwn(params, "phrase") === Object.hasOwn(params, "tokenAddress"))
      throw new FomoError("configuration", { reason: "market_search" });
    const body =
      "phrase" in params
        ? { phrase: identifier(params.phrase!, "phrase") }
        : { token: identifier(params.tokenAddress, "token_address") };
    const result = await this.connection.readQuery("market.search", body, options);
    return { ...result, data: array(result.data, "search_tokens").map(parseMetrics) };
  }
  allowlist(options: RequestOptions = {}): Promise<ApiResult<TokenAllowlist>> {
    return parsedResult(
      this.connection.request("market.allowlist", "/tokenAllowList/detailed", {}, options),
      parseAllowlist,
    );
  }
}
