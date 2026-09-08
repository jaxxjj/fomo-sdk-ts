import { writeFileSync, renameSync, mkdirSync, unlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { Redactor } from "../test/support/cassette.mjs";

// Protocol investigation only. This is not a new public SDK subscription API.
export async function recordMarketTrace({ accessToken, scenario, token, directory }) {
  if (!accessToken || !directory || !["trending", "prices"].includes(scenario))
    throw new Error("Explicit credentials, scenario and directory required");
  if (scenario === "prices" && (!token?.address || !Number.isSafeInteger(token.networkId)))
    throw new Error("Explicit token required");
  const topicType = scenario === "trending" ? "trending_tokens" : "prices";
  const topicId =
    scenario === "trending"
      ? "1,56,143,4663,8453,1399811149"
      : `${token.address}:${token.networkId}`;
  const redactor = new Redactor();
  redactor.addSecret(accessToken);
  const frames = [];
  const start = performance.now();
  let ack = false,
    snapshot = false,
    update = false,
    price = false;
  const socket = new WebSocket("wss://prod-api.fomo.family/ws");
  const add = (direction, event, text) => {
    if (frames.length >= 128 || (text && Buffer.byteLength(text) > 1024 * 1024))
      throw new Error("Trace capture limit exceeded");
    frames.push({
      direction,
      event,
      offsetMs: Math.round(performance.now() - start),
      ...(text === undefined ? {} : { text: redactor.json(text) }),
    });
  };
  const send = (value) => {
    const text = JSON.stringify(value);
    add("client", "message", text);
    socket.send(text);
  };
  try {
    await new Promise((resolvePromise, reject) => {
      const timeout = setTimeout(() => finish(new Error("Market trace deadline exceeded")), 15_000);
      let finished = false;
      const finish = (error) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        error ? reject(error) : resolvePromise();
      };
      socket.addEventListener("error", () => finish(new Error("Market socket error")));
      socket.addEventListener("close", () => finish(new Error("Market socket closed early")));
      socket.addEventListener("open", () => add("server", "open"));
      socket.addEventListener("message", (event) => {
        if (finished) return;
        try {
          add("server", "message", event.data);
          // Inspect only control fields; the stored frame uses lossless JSON above.
          const data = JSON.parse(event.data);
          if (data.type === "challenge") send({ type: "challengeResponse", jwt: accessToken });
          if (data.type === "challengeAccepted") send({ type: "subscribe", topicType, topicId });
          if (data.topicType === topicType && data.topicId === topicId) {
            ack ||= data.type === "subscribed";
            if (data.type === "data") {
              snapshot ||= data.payload?.kind === "snapshot";
              update ||= data.payload?.kind === "update";
              price ||= typeof data.payload?.priceUsd === "number";
            }
          }
          if (ack && (scenario === "trending" ? snapshot && update : price)) finish();
        } catch {
          finish(new Error("Market capture failed"));
        }
      });
    });
    add("client", "close");
  } finally {
    socket.close();
  }
  const trace = {
    format: "sdk-ws-trace/v1",
    provenance: {
      kind: "live",
      source: "Native WebSocket protocol probe; not public SDK market support",
    },
    capturedAt: new Date().toISOString(),
    inputs: redactor.input({ topicType, topicId }),
    frames,
  };
  const text = JSON.stringify(trace, null, 2) + "\n";
  redactor.assertSafe(text);
  const file = resolve(directory, `${scenario}-live.json`);
  const temporary = `${file}.tmp-${randomUUID()}`;
  mkdirSync(dirname(file), { recursive: true });
  try {
    writeFileSync(temporary, text, { mode: 0o600, flag: "wx" });
    renameSync(temporary, file);
  } catch (error) {
    try {
      unlinkSync(temporary);
    } catch {}
    throw error;
  }
  return { scenario, frames: frames.length, ack, snapshot, update, price };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.env.FOMO_RECORD !== "1") throw new Error("Recording is opt-in");
    console.log(
      await recordMarketTrace({
        accessToken: process.env.FOMO_ACCESS_TOKEN,
        scenario: process.argv[2],
        token: JSON.parse(process.env.FOMO_RECORD_INPUTS ?? "{}").token,
        directory: new URL("../test/fixtures/ws/", import.meta.url).pathname,
      }),
    );
  } catch {
    console.error("Market trace recording failed; inspect privately.");
    process.exitCode = 1;
  }
}
