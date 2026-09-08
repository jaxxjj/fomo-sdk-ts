import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

export function loadTrace(file) {
  const trace = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(trace.format, "sdk-ws-trace/v1");
  assert.ok(["live", "synthetic"].includes(trace.provenance?.kind));
  assert.ok(trace.frames.length > 0);
  return trace;
}

/** Deterministic wire-order replay, not a wall-clock or delivery guarantee model. */
export class ReplaySocket extends EventTarget {
  constructor(trace) {
    super();
    this.frames = trace.frames;
    this.index = 0;
    this.closed = false;
    this.failure = undefined;
    this.pump();
  }
  pump() {
    if (this.pending || this.closed) return;
    // Yield once per server frame so the production iterator observes each transition.
    this.pending = setImmediate(() => {
      this.pending = undefined;
      if (this.closed) return;
      const frame = this.frames[this.index];
      if (!frame || frame.direction === "client") return;
      this.index++;
      if (frame.event === "message")
        this.dispatchEvent(new MessageEvent("message", { data: frame.text }));
      else if (frame.event === "close") {
        this.closed = true;
        this.dispatchEvent(new Event("close"));
      } else if (frame.event === "open") this.dispatchEvent(new Event("open"));
      else this.failure = new Error("Unknown server trace event");
      if (!this.closed) this.pump();
    });
  }
  send(text) {
    try {
      const frame = this.frames[this.index];
      assert.equal(frame?.direction, "client", "Unexpected client send");
      assert.equal(frame.event, "message");
      const actual = JSON.parse(text);
      if (actual.type === "challengeResponse") {
        assert.ok(typeof actual.jwt === "string" && actual.jwt.length > 0, "Missing JWT");
        actual.jwt = "<secret>";
      }
      assert.deepEqual(actual, JSON.parse(frame.text), "Client frame mismatch");
      this.index++;
      clearImmediate(this.pending);
      this.pending = undefined;
      this.pump();
    } catch (error) {
      // Production code may catch send errors. Retain the test failure separately.
      this.failure = error;
      throw error;
    }
  }
  close() {
    clearImmediate(this.pending);
    this.pending = undefined;
    if (this.closed) return;
    const frame = this.frames[this.index];
    if (frame?.direction === "client" && frame.event === "close") this.index++;
    else this.failure ??= new Error("Unexpected client close");
    this.closed = true;
    this.dispatchEvent(new Event("close"));
  }
  assertConsumed() {
    if (this.failure) throw this.failure;
    assert.equal(this.index, this.frames.length, "Unused WS trace frames");
    assert.ok(this.closed, "Replay socket was not closed");
  }
}
