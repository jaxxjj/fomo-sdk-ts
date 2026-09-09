import { FomoConnection, type RequestOptions, type ApiResult } from "../connection.js";
import { parseWatchlistEntry, type WatchlistEntry } from "../contracts/configuration.js";
import { listResult } from "../contracts/read.js";
export class WatchlistResource {
  constructor(private readonly connection: FomoConnection) {}
  list(options: RequestOptions = {}): Promise<ApiResult<WatchlistEntry[]>> {
    return listResult(
      this.connection.request("watchlist.list", "/watchlist", {}, options),
      parseWatchlistEntry,
      "watchlist",
    );
  }
}
