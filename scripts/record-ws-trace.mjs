import { writeFileSync, renameSync, mkdirSync, unlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { FomoClient, StaticSession } from "../dist/index.js";
import { FomoStreamClient } from "../dist/experimental/stream.js";
import { Redactor } from "../test/support/cassette.mjs";

export async function recordActivityTrace({ accessToken, directory }) {
  if (!accessToken || !directory) throw new Error("Explicit credentials and directory required");
  const http = new FomoClient({ session: new StaticSession({ accessToken }), maxRetries: 0 });
  const self = (await http.users.getCurrent()).data.id;
  const redactor = new Redactor();
  const accountAlias = "00000000-0000-4000-8000-000000000001";
  redactor.bind(self, accountAlias);
  redactor.addSecret(accessToken);
  const frames = [];
  const start = performance.now();
  const frame = (direction, event, text) => {
    if (frames.length >= 100) throw new Error("Trace frame limit exceeded");
    frames.push({
      direction,
      event,
      offsetMs: Math.round(performance.now() - start),
      ...(text === undefined ? {} : { text: redactor.json(text) }),
    });
  };
  let captureError;
  class RecordingSocket extends EventTarget {
    constructor(url) {
      super();
      this.socket = new WebSocket(url);
      for (const event of ["message", "open", "close", "error"]) {
        this.socket.addEventListener(event, (value) => {
          try {
            if (event === "error") throw new Error("Live socket error");
            // Locally initiated close is already represented by the client action.
            if (event !== "close" || !this.locallyClosed)
              frame("server", event, event === "message" ? value.data : undefined);
            this.dispatchEvent(
              event === "message"
                ? new MessageEvent("message", { data: value.data })
                : new Event(event),
            );
          } catch (error) {
            captureError = error;
            this.socket.close();
            this.dispatchEvent(new Event("error"));
          }
        });
      }
    }
    send(text) {
      frame("client", "message", text);
      this.socket.send(text);
    }
    close() {
      if (this.locallyClosed) return;
      this.locallyClosed = true;
      frame("client", "close");
      this.socket.close();
    }
  }
  const stream = new FomoStreamClient(http, (url) => new RecordingSocket(url));
  const abort = new AbortController();
  const deadline = setTimeout(() => abort.abort(), 15_000);
  const iterator = stream.activity({ maxReconnects: 0, signal: abort.signal });
  let ready = false;
  try {
    for await (const event of iterator) {
      if (event.kind === "state" && event.state === "ready") {
        ready = true;
        break;
      }
    }
  } finally {
    clearTimeout(deadline);
    await iterator.return();
  }
  if (captureError || !ready) throw new Error("Live activity handshake was not qualified");
  const data = {
    format: "sdk-ws-trace/v1",
    provenance: {
      kind: "live",
      source: "FomoStreamClient current-account handshake; capture ends at ready",
    },
    capturedAt: new Date().toISOString(),
    inputs: { accountId: accountAlias },
    frames,
  };
  const text = JSON.stringify(data, null, 2) + "\n";
  redactor.assertSafe(text);
  const file = resolve(directory, "activity-live.json");
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
  return {
    frames: frames.length,
    ready,
    dataFrames: frames.filter((f) => f.text && JSON.parse(f.text).type === "data").length,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.env.FOMO_RECORD !== "1") throw new Error("Recording is opt-in");
    console.log(
      await recordActivityTrace({
        accessToken: process.env.FOMO_ACCESS_TOKEN,
        directory: new URL("../test/fixtures/ws/", import.meta.url).pathname,
      }),
    );
  } catch {
    console.error("WS recording failed; inspect privately.");
    process.exitCode = 1;
  }
}
