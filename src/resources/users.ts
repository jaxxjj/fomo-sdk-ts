import { type RequestOptions, type ApiResult, FomoConnection } from "../connection.js";
import { parseUser, type User } from "../contracts/models.js";
import { identifier } from "../contracts/validation.js";
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
}
