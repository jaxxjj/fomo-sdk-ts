import { FomoConnection, type RequestOptions, type ApiResult } from "../connection.js";
import { limit, identifier } from "../contracts/validation.js";
import { parsedResult, optionalId } from "../contracts/read.js";
import { parseFeedPage, type FeedPage } from "../contracts/feed.js";
import { FomoError } from "../errors.js";
export interface FeedListParams {
  feedTypes: readonly string[];
  limit?: number;
  cursor?: string;
}
export function feedTypes(values: readonly string[]): string[] {
  if (!Array.isArray(values) || !values.length || values.length > 30)
    throw new FomoError("configuration", { reason: "feed_types" });
  return values.map((value) => identifier(value, "feed_type"));
}
export class FeedResource {
  constructor(private readonly connection: FomoConnection) {}
  /** Provider aggregate/social feed. Rows are not guaranteed to be individual swaps. */
  list(params: FeedListParams, options: RequestOptions = {}): Promise<ApiResult<FeedPage>> {
    return parsedResult(
      this.connection.request(
        "feed.list",
        "/feed",
        {
          feedTypes: feedTypes(params.feedTypes),
          limit: limit(params.limit),
          lastFeedId: optionalId(params.cursor, "cursor"),
        },
        options,
      ),
      parseFeedPage,
    );
  }
}
