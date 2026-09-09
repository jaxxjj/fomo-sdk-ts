import * as v from "./validation.js";
import { parseMetrics, type TokenMetrics } from "./market.js";
import { parseTrade, type Trade } from "./trades.js";
export interface PortfolioSnapshot extends v.SourceObject {
  snapshotId: string;
  pnl: v.DecimalString;
  equity: v.DecimalString;
}
export interface TokenBalance extends v.SourceObject {
  balance: v.DecimalString;
  shiftedBalance?: v.DecimalString | null;
  tokenAddress: string;
  tokenId?: string | null;
}
const POSITION_AMOUNTS = [
  "humanAmountRemaining",
  "tokenAmountRemaining",
  "averageEntryPriceUsd",
  "currentRealizedPnlUsd",
  "totalRealizedPnlUsd",
  "currentCostBasisUsd",
  "totalCostBasisUsd",
] as const;
export type UserTokenPosition = v.SourceObject &
  Partial<Record<(typeof POSITION_AMOUNTS)[number], v.DecimalString | null>> & {
    id: string;
    tokenAddress: string;
    networkId: number;
    updatedAt?: string | null;
    holdingSince?: string | null;
    wasSwapped?: boolean | null;
  };
export interface ValuationPolicy extends v.SourceObject {
  useLivePrice?: boolean | null;
  includeInEquity?: boolean | null;
  includeUnrealizedPnl?: boolean | null;
  includeRealizedPnl?: boolean | null;
}
export interface BalanceRow extends v.SourceObject {
  balance: TokenBalance;
  userToken: UserTokenPosition;
  tokenFilterResult?: TokenMetrics | null;
  activeTrade?: Trade | null;
  valuation?: ValuationPolicy | null;
}
export interface PortfolioBalances extends v.SourceObject {
  balances: BalanceRow[];
  /** No populated native-balance variant has been qualified; retained as extension records. */
  nativeEvmBalances: v.SourceObject[];
  otherPnl?: v.DecimalString | null;
  otherPnlV2?: v.DecimalString | null;
  livePerpPnl?: v.DecimalString | null;
  otherEquity?: v.DecimalString | null;
}
export function parseBalanceRow(value: unknown): BalanceRow {
  const raw = v.object(value, "balance_row");
  const balance = v.object(raw.balance, "token_balance"),
    position = v.object(raw.userToken, "user_token");
  return {
    ...raw,
    balance: {
      ...balance,
      balance: v.decimal(balance.balance, "balance") ?? v.malformed("balance"),
      tokenAddress: v.string(balance.tokenAddress, "token_address"),
      ...v.fields(balance, ["shiftedBalance"], v.decimal),
      ...v.fields(balance, ["tokenId"], v.optionalString),
    },
    userToken: {
      ...position,
      id: v.string(position.id, "user_token_id"),
      tokenAddress: v.string(position.tokenAddress, "token_address"),
      networkId: v.count(position.networkId, "network_id"),
      ...v.fields(position, POSITION_AMOUNTS, v.decimal),
      ...v.fields(position, ["updatedAt", "holdingSince"], v.optionalTimestamp),
      ...v.fields(position, ["wasSwapped"], v.optionalBoolean),
    },
    ...v.fields(raw, ["tokenFilterResult"], (x) => v.optional(x, parseMetrics)),
    ...v.fields(raw, ["activeTrade"], (x) => v.optional(x, parseTrade)),
    ...v.fields(raw, ["valuation"], (x) =>
      v.optional(x, (value) => {
        const r = v.object(value, "valuation");
        return {
          ...r,
          ...v.fields(
            r,
            ["useLivePrice", "includeInEquity", "includeUnrealizedPnl", "includeRealizedPnl"],
            v.optionalBoolean,
          ),
        };
      }),
    ),
  };
}
export function parseBalances(value: unknown): PortfolioBalances {
  const raw = v.object(value, "portfolio_balances");
  return {
    ...raw,
    balances: v.list(raw.balances, "balances", parseBalanceRow),
    nativeEvmBalances: v.list(raw.nativeEvmBalances, "native_balances", (x) =>
      v.object(x, "native_balance"),
    ),
    ...v.fields(raw, ["otherPnl", "otherPnlV2", "livePerpPnl", "otherEquity"], v.decimal),
  };
}
export function parsePortfolioSnapshot(value: unknown): PortfolioSnapshot {
  const raw = v.object(value, "portfolio_snapshot");
  return {
    ...raw,
    snapshotId: v.string(raw.snapshotId, "snapshot_id"),
    pnl: v.decimal(raw.pnl, "pnl") ?? v.malformed("pnl"),
    equity: v.decimal(raw.equity, "equity") ?? v.malformed("equity"),
  };
}
