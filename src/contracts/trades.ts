import * as v from "./validation.js";
import { parseSwap, type Swap } from "./models.js";
import { parseComment, type ThesisComment } from "./comments.js";
const AMOUNTS = [
  "humanTokenAmount",
  "avgEntryPrice",
  "avgExitPrice",
  "sumSwapOpen",
  "sumSwapClosed",
  "sumTransferIn",
  "sumTransferOut",
  "avgTransferInPrice",
  "avgTransferOutPrice",
  "realizedPnlUsd",
  "unrealizedPnlUsd",
  "totalCostBasis",
] as const;
export interface TradeTokenMetadata extends v.SourceObject {
  symbol?: string | null;
  networkId?: number | null;
  imageLargeUrl?: string | null;
  thumbhash?: string | null;
  liquidity?: v.DecimalString | null;
  currentPrice?: v.DecimalString | null;
}
export type Trade = v.SourceObject &
  Partial<Record<(typeof AMOUNTS)[number], v.DecimalString | null>> & {
    id: string;
    tokenAddress?: string | null;
    userAddress?: string | null;
    networkId?: number | null;
    createdAt?: string | null;
    updatedAt?: string | null;
    closedAt?: string | null;
    tokenMetadata?: TradeTokenMetadata | null;
  };
export interface TradeDetail extends v.SourceObject {
  trade: Trade;
  swaps: Swap[];
  transfers: Transfer[];
  userId?: string | null;
  displayName?: string | null;
  userHandle?: string | null;
  profilePictureLink?: string | null;
  verified?: boolean | null;
  isDev?: boolean | null;
  comment?: ThesisComment | null;
  numReplies?: number | null;
}
export interface TradeRow extends v.SourceObject {
  trade: Trade;
  swaps?: Swap[] | null;
  transfers?: Transfer[] | null;
  verified?: boolean | null;
  type?: string | null;
  comment?: ThesisComment | null;
}
export interface TransferDestination extends v.SourceObject {
  displayName?: string | null;
  userHandle?: string | null;
  profilePictureLink?: string | null;
  userId?: string | null;
  verified?: boolean | null;
}
export interface Transfer extends v.SourceObject {
  id: string;
  createdAt: string;
  type: string;
  networkId: number;
  toAddress?: string | null;
  fromAddress?: string | null;
  tokenAddress?: string | null;
  humanAmount?: v.DecimalString | null;
  tokenAmount?: v.DecimalString | null;
  tokenAmountString?: v.DecimalString | null;
  usdAmount?: v.DecimalString | null;
  isNativeToken?: boolean | null;
  isReferral?: boolean | null;
  isCrossmint?: boolean | null;
  fromTradeId?: string | null;
  toTradeId?: string | null;
  label?: string | null;
  message?: string | null;
  destinationMetadata?: TransferDestination | null;
  tokenMetadata?: TradeTokenMetadata | null;
}
export interface TradesPage extends v.SourceObject {
  activeTrades: TradeRow[];
  closedTrades: TradeRow[];
  hasNextPage: boolean;
  closedCount: number;
}
export function parseTrade(value: unknown): Trade {
  const raw = v.object(value, "trade");
  return {
    ...raw,
    id: v.string(raw.id, "trade_id"),
    ...v.fields(raw, AMOUNTS, v.decimal),
    ...v.fields(raw, ["tokenAddress", "userAddress", "commentId"], v.optionalString),
    ...v.fields(raw, ["networkId"], v.optionalCount),
    ...v.fields(raw, ["createdAt", "updatedAt", "closedAt"], v.optionalTimestamp),
    ...v.fields(raw, ["tokenMetadata"], (x) =>
      v.optional(x, (value) => {
        const r = v.object(value, "trade_token");
        return {
          ...r,
          ...v.fields(r, ["symbol", "imageLargeUrl", "thumbhash"], v.optionalString),
          ...v.fields(r, ["networkId"], v.optionalCount),
          ...v.fields(r, ["liquidity", "currentPrice"], v.decimal),
        };
      }),
    ),
  };
}
function parseTradeRow(value: unknown): TradeRow {
  const raw = v.object(value, "trade_row");
  return {
    ...raw,
    trade: parseTrade(raw.trade),
    ...v.fields(raw, ["swaps"], (x) => v.optional(x, (value) => v.list(value, "swaps", parseSwap))),
    ...v.fields(raw, ["transfers"], (x) =>
      v.optional(x, (value) => v.list(value, "transfers", parseTransfer)),
    ),
    ...v.fields(raw, ["verified"], v.optionalBoolean),
    ...v.fields(raw, ["type"], v.optionalString),
    ...v.fields(raw, ["comment"], (x) => v.optional(x, parseComment)),
  };
}
export function parseTransfer(value: unknown): Transfer {
  const raw = v.object(value, "transfer");
  return {
    ...raw,
    id: v.string(raw.id, "transfer_id"),
    createdAt: v.timestamp(raw.createdAt, "created_at"),
    type: v.string(raw.type, "transfer_type"),
    networkId: v.count(raw.networkId, "network_id"),
    ...v.fields(
      raw,
      ["toAddress", "fromAddress", "tokenAddress", "fromTradeId", "toTradeId", "label", "message"],
      v.optionalString,
    ),
    ...v.fields(raw, ["humanAmount", "tokenAmount", "tokenAmountString", "usdAmount"], v.decimal),
    ...v.fields(raw, ["isNativeToken", "isReferral", "isCrossmint"], v.optionalBoolean),
    ...v.fields(raw, ["destinationMetadata"], (x) =>
      v.optional(x, (value) => {
        const r = v.object(value, "destination");
        return {
          ...r,
          ...v.fields(
            r,
            ["displayName", "userHandle", "profilePictureLink", "userId"],
            v.optionalString,
          ),
          ...v.fields(r, ["verified"], v.optionalBoolean),
        };
      }),
    ),
    ...v.fields(raw, ["tokenMetadata"], (x) =>
      v.optional(x, (value) => {
        const r = v.object(value, "token_metadata");
        return {
          ...r,
          ...v.fields(r, ["imageLargeUrl", "symbol", "thumbhash"], v.optionalString),
          ...v.fields(r, ["networkId"], v.optionalCount),
          ...v.fields(r, ["liquidity", "currentPrice"], v.decimal),
        };
      }),
    ),
  };
}
export function parseTradeDetail(value: unknown): TradeDetail {
  const raw = v.object(value, "trade_detail");
  return {
    ...raw,
    trade: parseTrade(raw.trade),
    swaps: v.list(raw.swaps, "swaps", parseSwap),
    transfers: v.list(raw.transfers, "transfers", parseTransfer),
    ...v.fields(
      raw,
      ["userId", "displayName", "userHandle", "profilePictureLink"],
      v.optionalString,
    ),
    ...v.fields(raw, ["verified", "isDev"], v.optionalBoolean),
    ...v.fields(raw, ["numReplies"], v.optionalCount),
    ...v.fields(raw, ["comment"], (x) => v.optional(x, parseComment)),
  };
}
export function parseTradesPage(value: unknown): TradesPage {
  const raw = v.object(value, "trades_page");
  return {
    ...raw,
    activeTrades: v.list(raw.activeTrades, "active_trades", parseTradeRow),
    closedTrades: v.list(raw.closedTrades, "closed_trades", parseTradeRow),
    hasNextPage: v.boolean(raw.hasNextPage, "has_next_page"),
    closedCount: v.count(raw.closedCount, "closed_count"),
  };
}
