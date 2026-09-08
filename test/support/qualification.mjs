import { mkdirSync, writeFileSync, renameSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

export function isAccessFailure(error, blockedStatuses) {
  return (
    ["authentication", "session_changed"].includes(error?.kind) ||
    blockedStatuses.includes(error?.status)
  );
}

// Error objects from the SDK are already redacted. Never persist raw messages/stacks.
export function safeError(error) {
  return Object.fromEntries(
    ["kind", "reason", "status", "apiCode"]
      .filter((key) => error[key] !== undefined)
      .map((key) => [key, error[key]]),
  );
}
export function summarize(value) {
  if (value === null) return { type: "null" };
  if (Array.isArray(value)) return { type: "array", rows: value.length };
  if (typeof value === "object") {
    const list = value.list ?? value.items ?? value.swaps ?? value.leaderboard;
    return { type: "object", ...(Array.isArray(list) ? { rows: list.length } : {}) };
  }
  return { type: typeof value };
}
export async function outcome(run) {
  try {
    const value = await run();
    return { ok: true, summary: summarize(value) };
  } catch (error) {
    if (!error?.kind) throw new Error("Unexpected qualification implementation failure");
    return { ok: false, error: safeError(error) };
  }
}
export function writeReport(file, value) {
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${randomUUID()}`;
  try {
    writeFileSync(temporary, JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    renameSync(temporary, file);
  } catch (error) {
    try {
      unlinkSync(temporary);
    } catch {}
    throw error;
  }
}
