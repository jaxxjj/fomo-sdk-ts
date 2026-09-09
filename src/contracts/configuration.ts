import * as v from "./validation.js";
export interface WatchlistEntry extends v.SourceObject {
  tokenAddress: string;
  networkId: number;
  createdAt?: string | null;
}
export interface AllowedToken extends WatchlistEntry {
  name?: string | null;
  ticker?: string | null;
  iconLink?: string | null;
  isLowFees?: boolean | null;
  categories?: string[] | null;
  notes?: string | null;
}
export interface TokenAllowlist extends v.SourceObject {
  tokens: AllowedToken[];
  categories: string[];
}
export interface CrossmintConfig extends v.SourceObject {
  minimumAmount?: v.DecimalString | null;
  dailyMaximum?: v.DecimalString | null;
  maximumAmount?: v.DecimalString | null;
  defaultBuyAmount?: v.DecimalString | null;
  minimumAmountByChain?: Record<string, v.DecimalString> | null;
}
const FEATURES = [
  "perpsTrading",
  "perpsTradingAvailable",
  "perpsTradingAcknowledged",
  "tosAcknowledged",
  "crossmintAvailable",
  "coinbaseApplePayCountryEligible",
  "crossmintOnrampAvailable",
  "cashAppDepositsAvailable",
] as const;
export type AppFeatures = v.SourceObject &
  Partial<Record<(typeof FEATURES)[number], boolean | null>>;
export interface AppConfiguration extends v.SourceObject {
  crossmint?: CrossmintConfig | null;
  simulateBeforeSend?: boolean | null;
  transferMessageMaxLength?: number | null;
  primarySolanaRpc?: string | null;
  awaitRelayConfirmationOnSells?: boolean | null;
  isUk?: boolean | null;
  archaxApprovalDate?: string | null;
  features?: AppFeatures | null;
  evmGasLimitBufferMultiplier?: number | null;
  evmGasLimitBufferDivisor?: number | null;
  perpsFeeTierDbps?: number | null;
}
function stringList(value: unknown): string[] {
  return v.list(value, "strings", (x) => v.string(x, "string"));
}
export function parseWatchlistEntry(value: unknown): WatchlistEntry {
  const raw = v.object(value, "watchlist_entry");
  return {
    ...raw,
    tokenAddress: v.string(raw.tokenAddress, "token_address"),
    networkId: v.count(raw.networkId, "network_id"),
    ...v.fields(raw, ["createdAt"], v.optionalTimestamp),
  };
}
export function parseAllowedToken(value: unknown): AllowedToken {
  const raw = v.object(value, "allowed_token");
  return {
    ...parseWatchlistEntry(raw),
    ...v.fields(raw, ["name", "ticker", "iconLink", "notes"], v.optionalString),
    ...v.fields(raw, ["isLowFees"], v.optionalBoolean),
    ...v.fields(raw, ["categories"], (x) => v.optional(x, stringList)),
  };
}
export function parseAllowlist(value: unknown): TokenAllowlist {
  const raw = v.object(value, "allowlist");
  return {
    ...raw,
    tokens: v.list(raw.tokens, "tokens", parseAllowedToken),
    categories: stringList(raw.categories),
  };
}
export function parseConfiguration(value: unknown): AppConfiguration {
  const raw = v.object(value, "configuration");
  return {
    ...raw,
    ...v.fields(
      raw,
      ["simulateBeforeSend", "awaitRelayConfirmationOnSells", "isUk"],
      v.optionalBoolean,
    ),
    ...v.fields(
      raw,
      [
        "transferMessageMaxLength",
        "evmGasLimitBufferMultiplier",
        "evmGasLimitBufferDivisor",
        "perpsFeeTierDbps",
      ],
      v.optionalCount,
    ),
    ...v.fields(raw, ["primarySolanaRpc", "archaxApprovalDate"], v.optionalString),
    ...v.fields(raw, ["features"], (x) =>
      v.optional(x, (value) => {
        const r = v.object(value, "features");
        return { ...r, ...v.fields(r, FEATURES, v.optionalBoolean) };
      }),
    ),
    ...v.fields(raw, ["crossmint"], (x) =>
      v.optional(x, (value) => {
        const r = v.object(value, "crossmint");
        return {
          ...r,
          ...v.fields(
            r,
            ["minimumAmount", "dailyMaximum", "maximumAmount", "defaultBuyAmount"],
            v.decimal,
          ),
          ...v.fields(r, ["minimumAmountByChain"], (x) =>
            v.optional(x, (value) =>
              Object.fromEntries(
                Object.entries(v.object(value, "minimum_amount_by_chain")).map(([k, x]) => [
                  k,
                  v.decimal(x, "minimum_amount") ?? v.malformed("minimum_amount"),
                ]),
              ),
            ),
          ),
        };
      }),
    ),
  };
}
