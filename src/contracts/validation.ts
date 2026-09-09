import { FomoError } from "../errors.js";
export type SourceObject = Record<string, unknown>;
export type DecimalString = string;
export function malformed(field: string): never {
  throw new FomoError("protocol", { reason: `invalid_${field}` });
}
export function object(value: unknown, field = "object"): SourceObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return malformed(field);
  return value as SourceObject;
}
export function string(value: unknown, field: string): string {
  if (typeof value !== "string" || !value) return malformed(field);
  return value;
}
export function optionalString(value: unknown, field: string): string | null | undefined {
  if (value == null) return value;
  if (typeof value !== "string") return malformed(field);
  return value;
}
export function optionalBoolean(value: unknown, field: string): boolean | null | undefined {
  return value == null ? value : boolean(value, field);
}
export function optionalTimestamp(value: unknown, field: string): string | null | undefined {
  return value == null ? value : timestamp(value, field);
}
export function optional<T>(value: unknown, parse: (value: unknown) => T): T | null | undefined {
  return value == null ? value : parse(value);
}
export function list<T>(value: unknown, field: string, parse: (value: unknown) => T): T[] {
  return array(value, field).map(parse);
}
/** Preserve absent fields; only named, present fields are normalized. */
export function fields<K extends string, T>(
  raw: SourceObject,
  keys: readonly K[],
  parse: (value: unknown, field: string) => T,
): Partial<Record<K, T>> {
  const result: Partial<Record<K, T>> = {};
  for (const key of keys) if (Object.hasOwn(raw, key)) result[key] = parse(raw[key], key);
  return result;
}
export function decimal(value: unknown, field: string): DecimalString | null | undefined {
  if (value == null) return value;
  if (typeof value !== "string" || !/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value))
    return malformed(field);
  return value;
}
export function count(value: unknown, field: string): number {
  if (typeof value !== "string" || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))
    return malformed(field);
  return Number(value);
}
export function optionalCount(value: unknown, field: string): number | null | undefined {
  return value == null ? value : count(value, field);
}
export function boolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") return malformed(field);
  return value;
}
export function array(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) return malformed(field);
  return value;
}
export function timestamp(value: unknown, field: string): string {
  const text = string(value, field);
  if (!Number.isFinite(Date.parse(text))) return malformed(field);
  return text;
}
export function identifier(value: string, field: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 512) {
    throw new FomoError("configuration", { reason: field });
  }
  return value.trim();
}
export function limit(value = 25): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 200)
    throw new FomoError("configuration", { reason: "limit" });
  return value;
}
