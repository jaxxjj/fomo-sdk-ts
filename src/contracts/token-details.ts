import * as v from "./validation.js";
const COUNTS = [
  "buyCount5m",
  "buyCount1",
  "buyCount4",
  "buyCount24",
  "sellCount5m",
  "sellCount1",
  "sellCount4",
  "sellCount24",
  "uniqueBuys5m",
  "uniqueBuys1",
  "uniqueBuys4",
  "uniqueBuys24",
  "uniqueSells5m",
  "uniqueSells1",
  "uniqueSells4",
  "uniqueSells24",
  "holders",
] as const;
const AMOUNTS = [
  "buyVolume5m",
  "buyVolume1",
  "buyVolume4",
  "buyVolume24",
  "sellVolume5m",
  "sellVolume1",
  "sellVolume4",
  "sellVolume24",
  "top10HoldersPercent",
] as const;
export type TokenDetails = v.SourceObject &
  Partial<Record<(typeof COUNTS)[number], number | null>> &
  Partial<Record<(typeof AMOUNTS)[number], v.DecimalString | null>> & {
    isLowFees?: boolean | null;
  };
export interface TokenWarning extends v.SourceObject {
  type: string;
  severity?: string | null;
  priority?: number | null;
  name?: string | null;
  description?: string | null;
}
export interface TokenWarnings extends v.SourceObject {
  disableBuying: boolean;
  disableSelling: boolean;
  warnings: TokenWarning[];
}
export function parseTokenDetails(value: unknown): TokenDetails {
  const raw = v.object(value, "token_details");
  return {
    ...raw,
    ...v.fields(raw, COUNTS, v.optionalCount),
    ...v.fields(raw, AMOUNTS, v.decimal),
    ...v.fields(raw, ["isLowFees"], v.optionalBoolean),
  };
}
function parseWarning(value: unknown): TokenWarning {
  const raw = v.object(value, "token_warning");
  return {
    ...raw,
    type: v.string(raw.type, "warning_type"),
    ...v.fields(raw, ["severity", "name", "description"], v.optionalString),
    ...v.fields(raw, ["priority"], v.optionalCount),
  };
}
export function parseTokenWarnings(value: unknown): TokenWarnings {
  const raw = v.object(value, "token_warnings");
  return {
    ...raw,
    disableBuying: v.boolean(raw.disableBuying, "disable_buying"),
    disableSelling: v.boolean(raw.disableSelling, "disable_selling"),
    warnings: v.list(raw.warnings, "warnings", parseWarning),
  };
}
