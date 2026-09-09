import { type RequestOptions, FomoConnection } from "../connection.js";
import { type Page, type Activity, parseActivity } from "../contracts/models.js";
import { object, array, boolean, identifier, limit } from "../contracts/validation.js";
import { FomoError } from "../errors.js";
import { nonnegative } from "../contracts/read.js";
export interface ActivityListParams {
  limit?: number;
  cursor?: string;
  threshold?: number;
  minEquity?: number;
  minMarketCap?: number;
  maxMarketCap?: number;
}
export class ActivityResource {
  constructor(private readonly connection: FomoConnection) {}
  async list(
    params: ActivityListParams = {},
    options: RequestOptions = {},
  ): Promise<Page<Activity>> {
    if (
      params.minMarketCap !== undefined &&
      params.maxMarketCap !== undefined &&
      params.minMarketCap > params.maxMarketCap
    )
      throw new FomoError("configuration", { reason: "market_cap_range" });
    const result = await this.connection.request(
      "activity.list",
      "/feed/tradingActivity",
      {
        limit: limit(params.limit),
        lastId: params.cursor === undefined ? undefined : identifier(params.cursor, "cursor"),
        threshold: nonnegative(params.threshold, "threshold"),
        minEquity: nonnegative(params.minEquity, "min_equity"),
        minMarketCap: nonnegative(params.minMarketCap, "min_market_cap"),
        maxMarketCap: nonnegative(params.maxMarketCap, "max_market_cap"),
      },
      options,
    );
    const body = object(result.data, "activity_page");
    const data = array(body.items, "activities").map(parseActivity);
    const hasNextPage = boolean(body.hasNextPage, "has_next_page");
    if (hasNextPage && !data.length)
      throw new FomoError("pagination", {
        reason: "empty_nonterminal_page",
        operation: "activity.list",
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
}
