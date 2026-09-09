import { FomoConnection, type ConnectionOptions } from "./connection.js";
import { UsersResource } from "./resources/users.js";
import { LeaderboardsResource } from "./resources/leaderboards.js";
import { SwapsResource } from "./resources/swaps.js";
import { ActivityResource } from "./resources/activity.js";
import { TokensResource } from "./resources/tokens.js";
import { FomoError } from "./errors.js";
import { MarketResource } from "./resources/market.js";
import { ClansResource } from "./resources/clans.js";
import { PortfolioResource } from "./resources/portfolio.js";
import { TradesResource } from "./resources/trades.js";
import { WatchlistResource } from "./resources/watchlist.js";
import { FeedResource } from "./resources/feed.js";
import { AppResource } from "./resources/app.js";
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
  readonly market: MarketResource;
  readonly clans: ClansResource;
  readonly portfolio: PortfolioResource;
  readonly trades: TradesResource;
  readonly watchlist: WatchlistResource;
  readonly feed: FeedResource;
  readonly app: AppResource;
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
    this.market = new MarketResource(this.connection);
    this.clans = new ClansResource(this.connection);
    this.portfolio = new PortfolioResource(this.connection);
    this.trades = new TradesResource(this.connection);
    this.watchlist = new WatchlistResource(this.connection);
    this.feed = new FeedResource(this.connection);
    this.app = new AppResource(this.connection);
  }
}
