import test from "node:test";
import assert from "node:assert/strict";
import { decodeJson } from "../dist/http/response.js";
import { loadTrace } from "./support/ws-trace.mjs";

// These are decoder contracts, not public market-subscription qualification.
for (const scenario of ["trending", "prices"]) {
  test(`live ${scenario} protocol trace decodes through production lossless JSON`, () => {
    const trace = loadTrace(new URL(`./fixtures/ws/${scenario}-live.json`, import.meta.url));
    assert.equal(trace.provenance.kind, "live");
    const decoded = trace.frames
      .filter((frame) => frame.direction === "server" && frame.event === "message")
      .map((frame) => decodeJson(frame.text));
    assert.ok(decoded.some((frame) => frame.type === "subscribed"));
    const data = decoded.filter((frame) => frame.type === "data");
    assert.ok(data.length > 0);
    for (const frame of data) {
      assert.equal(frame.topicType, trace.inputs.topicType);
      assert.equal(frame.topicId, trace.inputs.topicId);
    }
    if (scenario === "prices") {
      assert.match(data[0].payload.priceUsd, /^\d+(?:\.\d+)?$/);
      assert.match(data[0].payload.timestamp, /^\d+$/);
      assert.match(data[0].payload.blockNumber, /^\d+$/);
    } else {
      const snapshot = data.find((frame) => frame.payload.kind === "snapshot");
      const update = data.find((frame) => frame.payload.kind === "update");
      assert.ok(snapshot.payload.tokens.length > 0);
      assert.equal(typeof update.payload.update.priceUSD, "string");
      assert.equal(typeof update.payload.update.token.networkId, "string");
      // The activity stream's ACK gate cannot simply be reused for market topics.
      assert.ok(
        decoded.indexOf(snapshot) < decoded.findIndex((frame) => frame.type === "subscribed"),
      );
    }
    for (let i = 1; i < trace.frames.length; i++)
      assert.ok(trace.frames[i].offsetMs >= trace.frames[i - 1].offsetMs);
  });
}
