import { type RequestOptions, type ApiResult, FomoConnection } from "../connection.js";
import { parseUser, type User } from "../contracts/models.js";
import { object, array, limit } from "../contracts/validation.js";
import { FomoError } from "../errors.js";
export class LeaderboardsResource {
  constructor(private readonly connection: FomoConnection) {}
  async list(
    params: { window?: "24h" | "7d" | "30d" | "all"; limit?: number } = {},
    options: RequestOptions = {},
  ): Promise<ApiResult<User[]>> {
    const window = params.window ?? "24h";
    if (!["24h", "7d", "30d", "all"].includes(window))
      throw new FomoError("configuration", { reason: "window" });
    const result = await this.connection.request(
      "leaderboards.list",
      window === "all" ? "/v2/leaderboard" : `/v2/leaderboard/${window}`,
      { limit: limit(params.limit) },
      options,
    );
    return {
      ...result,
      data: array(object(result.data).leaderboard, "leaderboard").map(parseUser),
    };
  }
  async following(options: RequestOptions = {}): Promise<ApiResult<User[]>> {
    const result = await this.connection.request(
      "leaderboards.following",
      "/v2/leaderboard/following",
      {},
      options,
    );
    return { ...result, data: array(object(result.data).users, "users").map(parseUser) };
  }
}
