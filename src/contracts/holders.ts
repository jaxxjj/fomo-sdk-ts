import * as v from "./validation.js";
import { parseUser, type User } from "./users.js";
import { parseComment, type ThesisComment } from "./comments.js";
const AMOUNTS = [
  "humanAmount",
  "sumSwapOpen",
  "price",
  "value",
  "pnl",
  "unrealizedPnl",
  "realizedPnl",
  "costBasis",
  "averageEntryPrice",
  "averageHoldTimeSeconds",
] as const;
export type Holder = v.SourceObject &
  Partial<Record<(typeof AMOUNTS)[number], v.DecimalString | null>> & {
    user?: User | null;
    tradeId?: string | null;
    address?: string | null;
    comment?: ThesisComment | null;
    numReplies?: number | null;
    showComment?: boolean | null;
    isDev?: boolean | null;
  };
export interface HolderGroup extends v.SourceObject {
  networkId: number;
  tokenAddress: string;
  topHolders: Holder[];
  totalHolders: number;
}
export interface DeveloperHolders extends v.SourceObject {
  networkId: number;
  tokenAddress: string;
  devHoldings: Holder[];
}
export interface FriendHolders extends v.SourceObject {
  tokens: HolderGroup[];
}
export function parseHolder(value: unknown): Holder {
  const raw = v.object(value, "holder");
  return {
    ...raw,
    ...v.fields(raw, AMOUNTS, v.decimal),
    ...v.fields(raw, ["tradeId", "address"], v.optionalString),
    ...v.fields(raw, ["numReplies"], v.optionalCount),
    ...v.fields(raw, ["showComment", "isDev"], v.optionalBoolean),
    ...v.fields(raw, ["user"], (x) => v.optional(x, parseUser)),
    ...v.fields(raw, ["comment"], (x) => v.optional(x, parseComment)),
  };
}
export function parseHolderGroup(value: unknown): HolderGroup {
  const raw = v.object(value, "holder_group");
  return {
    ...raw,
    networkId: v.count(raw.networkId, "network_id"),
    tokenAddress: v.string(raw.tokenAddress, "token_address"),
    totalHolders: v.count(raw.totalHolders, "total_holders"),
    topHolders: v.list(raw.topHolders, "holders", parseHolder),
  };
}
export function parseDeveloperHolders(value: unknown): DeveloperHolders {
  const raw = v.object(value, "developer_holders");
  return {
    ...raw,
    networkId: v.count(raw.networkId, "network_id"),
    tokenAddress: v.string(raw.tokenAddress, "token_address"),
    devHoldings: v.list(raw.devHoldings, "dev_holdings", parseHolder),
  };
}
export function parseFriendHolders(value: unknown): FriendHolders {
  const raw = v.object(value, "friend_holders");
  return { ...raw, tokens: v.list(raw.tokens, "tokens", parseHolderGroup) };
}
