import { FomoConnection, type ConnectionOptions } from "./connection.js";
import { UsersResource } from "./resources/users.js";
import { LeaderboardsResource } from "./resources/leaderboards.js";
import { SwapsResource } from "./resources/swaps.js";
import { ActivityResource } from "./resources/activity.js";
import { TokensResource } from "./resources/tokens.js";
import { FomoError } from "./errors.js";
export type FomoClientOptions =
  | (ConnectionOptions & { connection?: never })
  | ({ connection: FomoConnection } & { [K in keyof ConnectionOptions]?: never });
export class FomoClient {
  readonly connection: FomoConnection;
  readonly users: UsersResource;
  readonly leaderboards: LeaderboardsResource;
  readonly swaps: SwapsResource;
  readonly activity: ActivityResource;
  readonly tokens: TokensResource;
  constructor(options: FomoClientOptions) {
    if (!options || typeof options !== "object")
      throw new FomoError("configuration", { reason: "client_options" });
    if (
      "connection" in options &&
      (Object.keys(options).some((key) => key !== "connection") ||
        !(options.connection instanceof FomoConnection))
    ) {
      throw new FomoError("configuration", { reason: "connection_options" });
    }
    this.connection = options.connection ?? new FomoConnection(options as ConnectionOptions);
    this.users = new UsersResource(this.connection);
    this.leaderboards = new LeaderboardsResource(this.connection);
    this.swaps = new SwapsResource(this.connection);
    this.activity = new ActivityResource(this.connection);
    this.tokens = new TokensResource(this.connection);
  }
}
