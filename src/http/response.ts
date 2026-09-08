import { parse } from "lossless-json";
import { FomoError } from "../errors.js";
import type { HttpResponse } from "./transport.js";

/** JSON numeric literals become their exact decimal lexemes, never JS doubles. */
export function decodeJson(text: string): unknown {
  try {
    return parse(text, undefined, {
      parseNumber: (value) => value,
      onDuplicateKey: () => {
        throw new Error();
      },
    });
  } catch {
    throw new FomoError("protocol", { reason: "invalid_json" });
  }
}
export async function readText(
  response: HttpResponse,
  limit: number,
  signal: AbortSignal,
): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const abort = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", abort, { once: true });
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  try {
    signal.throwIfAborted();
    for (;;) {
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) {
        abort();
        throw new FomoError("protocol", { reason: "response_too_large" });
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally {
    signal.removeEventListener("abort", abort);
    reader.releaseLock();
  }
}
export function retryAfter(headers: Headers): number | undefined {
  const raw = headers.get("retry-after");
  if (!raw) return undefined;
  const ms = /^\d+(?:\.\d+)?$/.test(raw) ? Number(raw) * 1000 : Date.parse(raw) - Date.now();
  return Number.isFinite(ms)
    ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.ceil(ms)))
    : undefined;
}
export function parseEnvelope(status: number, headers: Headers, text: string): unknown {
  if (status < 200 || status >= 300) {
    const kind =
      status === 401
        ? "authentication"
        : [403, 430, 431].includes(status)
          ? "access_denied"
          : status === 429
            ? "rate_limited"
            : "http";
    throw new FomoError(kind, { status, retryAfterMs: retryAfter(headers) });
  }
  const value = decodeJson(text);
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !("success" in value) ||
    typeof value.success !== "boolean" ||
    !("statusCode" in value) ||
    typeof value.statusCode !== "string" ||
    !/^\d{3}$/.test(value.statusCode)
  ) {
    throw new FomoError("protocol", { reason: "invalid_envelope" });
  }
  const code = Number(value.statusCode);
  if (!value.success || code < 200 || code >= 300) throw new FomoError("api", { status: code });
  if (!("responseObject" in value))
    throw new FomoError("protocol", { reason: "missing_response_object" });
  return value.responseObject;
}
