import * as v from "./validation.js";
import { tokenParams, type TokenRef } from "./models.js";
import { FomoError } from "../errors.js";

export interface MarketToken extends v.SourceObject {
  address: string;
  networkId: number;
  name?: string | null;
  symbol?: string | null;
  decimals?: number | null;
  createdAt?: number | null;
  freezable?: boolean | null;
  mintable?: boolean | null;
  isScam?: boolean | null;
  info?: TokenInfo | null;
}
export interface TokenInfo extends v.SourceObject {
  id?: string | null;
  imageThumbUrl?: string | null;
  imageLargeUrl?: string | null;
  circulatingSupply?: v.DecimalString | null;
  totalSupply?: v.DecimalString | null;
}
const METRIC_COUNTS = [
  "buyCount1",
  "buyCount4",
  "buyCount12",
  "buyCount24",
  "sellCount1",
  "sellCount4",
  "sellCount12",
  "sellCount24",
  "txnCount1",
  "txnCount4",
  "txnCount12",
  "txnCount24",
  "uniqueBuys1",
  "uniqueBuys4",
  "uniqueBuys12",
  "uniqueBuys24",
  "uniqueSells1",
  "uniqueSells4",
  "uniqueSells12",
  "uniqueSells24",
] as const;
export interface TokenMetrics
  extends v.SourceObject, Partial<Record<(typeof METRIC_COUNTS)[number], number | null>> {
  token: MarketToken;
  priceUSD?: v.DecimalString | null;
  marketCap?: v.DecimalString | null;
  liquidity?: v.DecimalString | null;
  change5m?: v.DecimalString | null;
  change1?: v.DecimalString | null;
  change4?: v.DecimalString | null;
  change12?: v.DecimalString | null;
  change24?: v.DecimalString | null;
  volume5m?: v.DecimalString | null;
  volume1?: v.DecimalString | null;
  volume4?: v.DecimalString | null;
  volume12?: v.DecimalString | null;
  volume24?: v.DecimalString | null;
  holders?: number | null;
  createdAt?: number | null;
}
export interface PriceBar {
  /** Unix seconds, not milliseconds. */
  timestamp: number;
  open: v.DecimalString;
  high: v.DecimalString;
  low: v.DecimalString;
  close: v.DecimalString;
  volume: v.DecimalString | null;
}
export interface BarSeries extends v.SourceObject {
  bars: PriceBar[];
}
export function tokenKey(token: TokenRef): string {
  const validated = tokenParams(token);
  return `${validated.tokenAddress}:${validated.networkId}`;
}
export function tokenBatch(tokens: readonly TokenRef[]): string[] {
  if (!Array.isArray(tokens) || tokens.length < 1 || tokens.length > 100)
    throw new FomoError("configuration", { reason: "token_batch" });
  return tokens.map(tokenKey);
}
export function parseMetrics(value: unknown): TokenMetrics {
  const raw = v.object(value, "token_metrics");
  const token = v.object(raw.token, "market_token");
  return {
    ...raw,
    token: {
      ...token,
      address: v.string(token.address, "token_address"),
      networkId: v.count(token.networkId, "network_id"),
      name: v.optionalString(token.name, "token_name"),
      symbol: v.optionalString(token.symbol, "token_symbol"),
      decimals: v.optionalCount(token.decimals, "token_decimals"),
      ...v.fields(token, ["createdAt"], v.optionalCount),
      ...v.fields(token, ["freezable", "mintable", "isScam"], v.optionalBoolean),
      ...v.fields(token, ["info"], (x) =>
        v.optional(x, (value) => {
          const r = v.object(value, "token_info");
          return {
            ...r,
            ...v.fields(r, ["id", "imageThumbUrl", "imageLargeUrl"], v.optionalString),
            ...v.fields(r, ["circulatingSupply", "totalSupply"], v.decimal),
          };
        }),
      ),
    },
    ...Object.fromEntries(
      [
        "priceUSD",
        "marketCap",
        "liquidity",
        "change5m",
        "change1",
        "change4",
        "change12",
        "change24",
        "volume5m",
        "volume1",
        "volume4",
        "volume12",
        "volume24",
      ].map((key) => [key, v.decimal(raw[key], key)]),
    ),
    holders: v.optionalCount(raw.holders, "holders"),
    ...v.fields(raw, METRIC_COUNTS, v.optionalCount),
    ...v.fields(raw, ["createdAt"], v.optionalCount),
  };
}
export function parseBars(value: unknown): BarSeries {
  const raw = v.object(value, "bars");
  if (raw.s === "no_data" && raw.c === undefined) return { ...raw, bars: [] };
  const columns = ["t", "o", "h", "l", "c"].map((key) => v.array(raw[key], `bars_${key}`));
  const size = columns[0]!.length;
  if (columns.some((column) => column.length !== size)) return v.malformed("bar_lengths");
  const volumeValue = raw.v ?? raw.volume;
  const volumes = volumeValue == null ? undefined : v.array(volumeValue, "bar_volume");
  if (volumes && volumes.length !== size) return v.malformed("bar_lengths");
  const price = (x: unknown) => v.decimal(x, "bar_price") ?? v.malformed("bar_price");
  return {
    ...raw,
    bars: columns[0]!.map((timestamp, index) => ({
      timestamp: v.count(timestamp, "bar_timestamp"),
      open: price(columns[1]![index]),
      high: price(columns[2]![index]),
      low: price(columns[3]![index]),
      close: price(columns[4]![index]),
      volume: volumes ? (v.decimal(volumes[index], "bar_volume") ?? null) : null,
    })),
  };
}
