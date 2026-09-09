import { FomoConnection, type RequestOptions, type ApiResult } from "../connection.js";
import { identifier } from "../contracts/validation.js";
import { parsedResult, optionalId } from "../contracts/read.js";
import {
  parseTradeDetail,
  parseTradesPage,
  type TradeDetail,
  type TradesPage,
} from "../contracts/trades.js";
import { parseCommentPage, type CommentPage } from "../contracts/comments.js";
export class TradesResource {
  constructor(private readonly connection: FomoConnection) {}
  /** Fomo trade/position history, distinct from per-swap execution history. */
  list(
    params: { userId: string; tokenAddress?: string; cursor?: string },
    options: RequestOptions = {},
  ): Promise<ApiResult<TradesPage>> {
    return parsedResult(
      this.connection.request(
        "trades.list",
        "/trades",
        {
          userId: identifier(params.userId, "user_id"),
          orderBy: "closedAt",
          tokenAddress: optionalId(params.tokenAddress, "token_address"),
          lastTradeId: optionalId(params.cursor, "cursor"),
        },
        options,
      ),
      parseTradesPage,
    );
  }
  get(params: { tradeId: string }, options: RequestOptions = {}): Promise<ApiResult<TradeDetail>> {
    return parsedResult(
      this.connection.request(
        "trades.get",
        `/trades/${encodeURIComponent(identifier(params.tradeId, "trade_id"))}`,
        {},
        options,
      ),
      parseTradeDetail,
    );
  }
  comments(
    params: { tradeId: string; cursor?: string },
    options: RequestOptions = {},
  ): Promise<ApiResult<CommentPage>> {
    return parsedResult(
      this.connection.request(
        "trades.comments",
        `/trades/${encodeURIComponent(identifier(params.tradeId, "trade_id"))}/comments`,
        {
          lastCommentId: optionalId(params.cursor, "cursor"),
        },
        options,
      ),
      parseCommentPage,
    );
  }
}
