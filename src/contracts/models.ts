import * as v from "./validation.js";
import type { ApiResult } from "../connection.js";
import { FomoError } from "../errors.js";
export type { DecimalString } from "./validation.js";
export { parseUser, type User } from "./users.js";
export { parseHolderGroup, type HolderGroup } from "./holders.js";
export type { ThesisComment } from "./comments.js";
import { parseComment, type ThesisComment } from "./comments.js";

export interface Swap extends v.SourceObject {
  id: string;
  createdAt: string;
  networkId?: number | null;
  inNetworkId?: number | null;
  outNetworkId?: number | null;
  inAmount?: v.DecimalString | null;
  outAmount?: v.DecimalString | null;
  inHumanAmount?: v.DecimalString | null;
  outHumanAmount?: v.DecimalString | null;
  humanUsdAmountIn?: v.DecimalString | null;
  humanUsdAmountOut?: v.DecimalString | null;
}
export interface TokenRef {
  networkId: number;
  address: string;
}
export interface Activity extends v.SourceObject {
  id: string;
  type: string;
  kind: "buy" | "sell" | "thesis" | "transfer_in" | "transfer_out" | "withdrawal" | "unknown";
  /** Null when the provider does not associate the event with a Fomo user. */
  userId: string | null;
  createdAt: string;
  tradeId?: string | null;
  networkId?: number | null;
  tokenAddress?: string | null;
  usdAmount?: v.DecimalString | null;
  price?: v.DecimalString | null;
  marketCap?: v.DecimalString | null;
  comment?: ThesisComment | null;
  authorTrade?: AuthorTrade | null;
  equity?: v.DecimalString | null;
  threshold?: v.DecimalString | null;
  numReplies?: number | null;
  verified?: boolean | null;
  isDev?: boolean | null;
}
const AUTHOR_AMOUNTS = [
  "humanTokenAmount",
  "usdValue",
  "unrealizedPnlUsd",
  "realizedPnlUsd",
  "percentageUnrealizedPnl",
  "percentageRealizedPnl",
] as const;
export type AuthorTrade = v.SourceObject &
  Partial<Record<(typeof AUTHOR_AMOUNTS)[number], v.DecimalString | null>> & {
    closedAt?: string | null;
  };
function parseAuthorTrade(value: unknown): AuthorTrade {
  const raw = v.object(value, "author_trade");
  return {
    ...raw,
    ...v.fields(raw, AUTHOR_AMOUNTS, v.decimal),
    ...v.fields(raw, ["closedAt"], v.optionalTimestamp),
  };
}
export interface PageInfo {
  hasNextPage: boolean;
  nextCursor?: string;
  sourceCount: number;
  stopReason?: "end" | "max_pages" | "max_items";
}
export interface Page<T> extends ApiResult<T[]> {
  pageInfo: PageInfo;
}

export function parseSwap(value: unknown): Swap {
  const raw = v.object(value, "swap");
  return {
    ...raw,
    id: v.string(raw.id, "swap_id"),
    createdAt: v.timestamp(raw.createdAt, "created_at"),
    networkId: v.optionalCount(raw.networkId, "network_id"),
    inNetworkId: v.optionalCount(raw.inNetworkId, "in_network_id"),
    outNetworkId: v.optionalCount(raw.outNetworkId, "out_network_id"),
    inAmount: v.decimal(raw.inAmount, "in_amount"),
    outAmount: v.decimal(raw.outAmount, "out_amount"),
    inHumanAmount: v.decimal(raw.inHumanAmount, "in_human_amount"),
    outHumanAmount: v.decimal(raw.outHumanAmount, "out_human_amount"),
    humanUsdAmountIn: v.decimal(raw.humanUsdAmountIn, "usd_in"),
    humanUsdAmountOut: v.decimal(raw.humanUsdAmountOut, "usd_out"),
  };
}
const ACTIONS: Record<string, Activity["kind"]> = {
  swap_buy: "buy",
  swap_sell: "sell",
  thesis: "thesis",
  transfer_in: "transfer_in",
  transfer_out: "transfer_out",
  swap_withdraw: "withdrawal",
};
export function parseActivity(value: unknown): Activity {
  const raw = v.object(value, "activity");
  const type = v.string(raw.type, "activity_type");
  let comment: ThesisComment | null | undefined;
  if (raw.comment == null) comment = raw.comment;
  else {
    const entry = v.object(raw.comment, "thesis_comment");
    if (typeof entry.comment !== "string") return v.malformed("thesis_text");
    comment = parseComment(entry);
  }
  return {
    ...raw,
    id: v.string(raw.id, "activity_id"),
    type,
    kind: Object.hasOwn(ACTIONS, type) ? ACTIONS[type] : "unknown",
    userId: raw.userId === null ? null : v.string(raw.userId, "user_id"),
    createdAt: v.timestamp(raw.createdAt, "created_at"),
    tradeId: v.optionalString(raw.tradeId, "trade_id"),
    networkId: v.optionalCount(raw.networkId, "network_id"),
    tokenAddress: v.optionalString(raw.tokenAddress, "token_address"),
    usdAmount: v.decimal(raw.usdAmount, "usd_amount"),
    price: v.decimal(raw.price, "price"),
    marketCap: v.decimal(raw.marketCap, "market_cap"),
    ...v.fields(raw, ["equity", "threshold"], v.decimal),
    ...v.fields(raw, ["numReplies"], v.optionalCount),
    ...v.fields(raw, ["verified", "isDev"], v.optionalBoolean),
    ...v.fields(raw, ["authorTrade"], (x) => v.optional(x, parseAuthorTrade)),
    comment,
  };
}
export function tokenParams(token: TokenRef): { networkId: number; tokenAddress: string } {
  if (!token || !Number.isSafeInteger(token.networkId) || token.networkId < 1) {
    throw new FomoError("configuration", { reason: "network_id" });
  }
  return { networkId: token.networkId, tokenAddress: v.identifier(token.address, "token_address") };
}
