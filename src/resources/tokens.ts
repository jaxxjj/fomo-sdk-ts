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
import { object, array, boolean } from "../contracts/validation.js";
import { FomoError } from "../errors.js";
export class TokensResource {
  constructor(private readonly connection: FomoConnection) {}
  async feed(
    params: { token: TokenRef; excludeThesis?: boolean; threshold?: number },
    options: RequestOptions = {},
  ): Promise<Page<Activity>> {
    const token = tokenParams(params.token);
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
      { ...token, excludeThesis: params.excludeThesis ?? false, threshold: params.threshold ?? 0 },
      options,
    );
    const body = object(result.data, "token_feed");
    const data = array(body.items, "activities").map(parseActivity);
    return {
      ...result,
      data,
      pageInfo: {
        hasNextPage: boolean(body.hasNextPage, "has_next_page"),
        sourceCount: data.length,
      },
    };
  }
  async holders(
    params: { token: TokenRef },
    options: RequestOptions = {},
  ): Promise<ApiResult<HolderGroup[]>> {
    const token = tokenParams(params.token);
    const result = await this.connection.request(
      "tokens.holders",
      "/hodlers/top",
      { tokens: JSON.stringify([{ address: token.tokenAddress, networkId: token.networkId }]) },
      options,
    );
    return { ...result, data: array(result.data, "holder_groups").map(parseHolderGroup) };
  }
}
