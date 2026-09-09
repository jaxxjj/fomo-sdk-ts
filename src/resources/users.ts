import { type RequestOptions, type ApiResult, FomoConnection } from "../connection.js";
import { parseUser, type User } from "../contracts/models.js";
import { identifier, object, array, string } from "../contracts/validation.js";
import { parsedResult, optionalId } from "../contracts/read.js";
import { parseRecommended, type RecommendedUsers } from "../contracts/users.js";
import { FomoError } from "../errors.js";
export class UsersResource {
  constructor(private readonly connection: FomoConnection) {}
  async getCurrent(options: RequestOptions = {}): Promise<ApiResult<User>> {
    const result = await this.connection.request(
      "users.getCurrent",
      "/v2/users/current",
      {},
      options,
    );
    const data = parseUser(result.data);
    this.connection.bindAccount(data.id);
    return { ...result, data };
  }
  async getByHandle(
    params: { handle: string },
    options: RequestOptions = {},
  ): Promise<ApiResult<User>> {
    const handle = identifier(params.handle, "handle");
    const result = await this.connection.request(
      "users.getByHandle",
      `/v2/users/userHandle/${encodeURIComponent(handle)}`,
      {},
      options,
    );
    return { ...result, data: parseUser(result.data) };
  }
  async getById(
    params: { userId: string },
    options: RequestOptions = {},
  ): Promise<ApiResult<User>> {
    const result = await this.connection.request(
      "users.getById",
      `/v2/users/${encodeURIComponent(identifier(params.userId, "user_id"))}`,
      {},
      options,
    );
    return { ...result, data: parseUser(result.data) };
  }
  async search(
    params: { searchTerm: string },
    options: RequestOptions = {},
  ): Promise<ApiResult<User[]>> {
    const result = await this.connection.request(
      "users.search",
      "/v2/users/fuzzy-search",
      { searchTerm: identifier(params.searchTerm, "search_term") },
      options,
    );
    return { ...result, data: array(object(result.data).users, "users").map(parseUser) };
  }
  async followingIds(options: RequestOptions = {}): Promise<ApiResult<string[]>> {
    const result = await this.connection.request(
      "users.followingIds",
      "/v2/users/current/followingIds",
      {},
      options,
    );
    return {
      ...result,
      data: array(object(result.data).followingIds, "following_ids").map((id) =>
        string(id, "user_id"),
      ),
    };
  }
  async followers(
    params: { userId: string },
    options: RequestOptions = {},
  ): Promise<ApiResult<User[]>> {
    const result = await this.connection.request(
      "users.followers",
      `/v2/users/${encodeURIComponent(identifier(params.userId, "user_id"))}/followers`,
      {},
      options,
    );
    return { ...result, data: array(object(result.data).users, "users").map(parseUser) };
  }
  /** Caller-managed page; source has no qualified hasNextPage flag. */
  async following(
    params: { userId: string; cursor?: string },
    options: RequestOptions = {},
  ): Promise<ApiResult<User[]>> {
    const result = await this.connection.request(
      "users.following",
      `/v2/users/${encodeURIComponent(identifier(params.userId, "user_id"))}/followingPaginate`,
      { lastId: optionalId(params.cursor, "cursor") },
      options,
    );
    return { ...result, data: array(object(result.data).users, "users").map(parseUser) };
  }
  async mutuals(
    params: { userId: string; cursor?: string },
    options: RequestOptions = {},
  ): Promise<ApiResult<User[]>> {
    const result = await this.connection.request(
      "users.mutuals",
      `/v2/users/${encodeURIComponent(identifier(params.userId, "user_id"))}/mutuals`,
      { lastId: optionalId(params.cursor, "cursor") },
      options,
    );
    return { ...result, data: array(object(result.data).users, "users").map(parseUser) };
  }
  recommended(
    params: { userId: string },
    options: RequestOptions = {},
  ): Promise<ApiResult<RecommendedUsers>> {
    return parsedResult(
      this.connection.request(
        "users.recommended",
        `/v2/users/${encodeURIComponent(identifier(params.userId, "user_id"))}/recommendedUsers`,
        {},
        options,
      ),
      parseRecommended,
    );
  }
  async getMany(
    params: { userIds: readonly string[] },
    options: RequestOptions = {},
  ): Promise<ApiResult<User[]>> {
    if (!Array.isArray(params.userIds) || !params.userIds.length || params.userIds.length > 100)
      throw new FomoError("configuration", { reason: "user_batch" });
    const result = await this.connection.request(
      "users.getMany",
      "/v2/users",
      { userIds: params.userIds.map((id) => identifier(id, "user_id")) },
      options,
    );
    return { ...result, data: array(object(result.data).users, "users").map(parseUser) };
  }
}
