import type { ApiResult } from "../connection.js";
import { array, object, identifier } from "./validation.js";
import { FomoError } from "../errors.js";

/** Source objects retain unknown fields; all numeric literals remain strings. */
export async function parsedResult<T>(
  result: Promise<ApiResult<unknown>>,
  parse: (value: unknown) => T,
): Promise<ApiResult<T>> {
  const value = await result;
  return { ...value, data: parse(value.data) };
}
export async function listResult<T>(
  result: Promise<ApiResult<unknown>>,
  parse: (value: unknown) => T,
  field?: string,
): Promise<ApiResult<T[]>> {
  const value = await result;
  const data = field === undefined ? value.data : object(value.data)[field];
  return { ...value, data: array(data, field ?? "items").map(parse) };
}
export function nonnegative(value: number | undefined, reason: string): number | undefined {
  if (value !== undefined && (!Number.isFinite(value) || value < 0))
    throw new FomoError("configuration", { reason });
  return value;
}
export function optionalId(value: string | undefined, field: string): string | undefined {
  return value === undefined ? undefined : identifier(value, field);
}
export function windowValue(value: string = "24h"): "24h" | "7d" | "30d" | "all" {
  if (!["24h", "7d", "30d", "all"].includes(value))
    throw new FomoError("configuration", { reason: "window" });
  return value as "24h" | "7d" | "30d" | "all";
}
