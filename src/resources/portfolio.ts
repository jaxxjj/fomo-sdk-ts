import { FomoConnection, type RequestOptions, type ApiResult } from "../connection.js";
import { identifier } from "../contracts/validation.js";
import { parsedResult, listResult } from "../contracts/read.js";
import {
  parseBalances,
  parsePortfolioSnapshot,
  type PortfolioBalances,
  type PortfolioSnapshot,
} from "../contracts/portfolio.js";
import { integer } from "../internal/async.js";
import { FomoError } from "../errors.js";
export class PortfolioResource {
  constructor(private readonly connection: FomoConnection) {}
  balances(
    params: { userId: string },
    options: RequestOptions = {},
  ): Promise<ApiResult<PortfolioBalances>> {
    return parsedResult(
      this.connection.request(
        "portfolio.balances",
        `/v2/users/${encodeURIComponent(identifier(params.userId, "user_id"))}/balances`,
        {},
        options,
      ),
      parseBalances,
    );
  }
  history(
    params: { userId: string; since: string; interval?: number },
    options: RequestOptions = {},
  ): Promise<ApiResult<PortfolioSnapshot[]>> {
    const since = identifier(params.since, "since");
    if (!/^\d{4}-\d\d-\d\dT/.test(since) || !Number.isFinite(Date.parse(since)))
      throw new FomoError("configuration", { reason: "since" });
    return listResult(
      this.connection.request(
        "portfolio.history",
        "/v2/userTokens/aggregatedSnapshot",
        {
          userId: identifier(params.userId, "user_id"),
          timestamp: since,
          interval:
            params.interval === undefined ? undefined : integer(params.interval, 1, 24, "interval"),
        },
        options,
      ),
      parsePortfolioSnapshot,
    );
  }
  historyAll(
    params: { userId: string },
    options: RequestOptions = {},
  ): Promise<ApiResult<PortfolioSnapshot[]>> {
    return listResult(
      this.connection.request(
        "portfolio.historyAll",
        "/v2/userTokens/aggregatedSnapshot/interval",
        {
          userId: identifier(params.userId, "user_id"),
        },
        options,
      ),
      parsePortfolioSnapshot,
    );
  }
  snapshot(
    params: { userId: string; snapshotId: string },
    options: RequestOptions = {},
  ): Promise<ApiResult<PortfolioSnapshot>> {
    return parsedResult(
      this.connection.request(
        "portfolio.snapshot",
        "/v2/userTokens/aggregatedSnapshotById",
        {
          userId: identifier(params.userId, "user_id"),
          snapshotId: identifier(params.snapshotId, "snapshot_id"),
        },
        options,
      ),
      parsePortfolioSnapshot,
    );
  }
}
