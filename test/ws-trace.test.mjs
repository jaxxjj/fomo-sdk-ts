import test from "node:test";
import assert from "node:assert/strict";
import { FomoStreamClient } from "../dist/experimental/stream.js";
import { client, response, envelope, user } from "./helpers.mjs";
import { loadTrace, ReplaySocket } from "./support/ws-trace.mjs";

test("synthetic WS trace exercises production handshake and lossless event decoding", async () => {
  const trace = loadTrace(new URL("./fixtures/ws/activity-synthetic.json", import.meta.url));
  const { client: http } = client(() => response(envelope(user())));
  let socket;
  const stream = new FomoStreamClient(http, () => (socket = new ReplaySocket(trace)));
  const iterator = stream.activity({ maxReconnects: 0 });
  try {
    assert.equal((await iterator.next()).value.state, "connecting");
    assert.equal((await iterator.next()).value.state, "ready");
    const event = (await iterator.next()).value;
    assert.equal(event.kind, "activity");
    assert.equal(event.data.amount, "900719925474099312345");
    assert.equal(event.data.price, "1.2300");
    assert.equal(event.data.optional, null);
    assert.equal(event.data.absent, undefined);
  } finally {
    await iterator.return();
  }
  socket.assertConsumed();
});

test("wrong client subscription cannot silently consume a trace", () => {
  const socket = new ReplaySocket({
    frames: [
      { direction: "client", event: "message", text: '{"type":"subscribe","topicId":"expected"}' },
    ],
  });
  assert.throws(() => socket.send('{"type":"subscribe","topicId":"wrong"}'));
  socket.close();
  assert.throws(() => socket.assertConsumed());
});

test("unused WS frames fail explicitly", () => {
  const socket = new ReplaySocket({
    frames: [
      { direction: "client", event: "message", text: '{"type":"subscribe"}' },
      { direction: "client", event: "close" },
    ],
  });
  socket.close();
  assert.throws(() => socket.assertConsumed());
});

test("live activity handshake trace reaches ready but makes no data-delivery claim", async () => {
  const trace = loadTrace(new URL("./fixtures/ws/activity-live.json", import.meta.url));
  assert.equal(trace.provenance.kind, "live");
  const { client: http } = client(() => response(envelope(user(trace.inputs.accountId))));
  let socket;
  const stream = new FomoStreamClient(http, () => (socket = new ReplaySocket(trace)));
  const iterator = stream.activity({ maxReconnects: 0 });
  try {
    assert.equal((await iterator.next()).value.state, "connecting");
    assert.equal((await iterator.next()).value.state, "ready");
  } finally {
    await iterator.return();
  }
  socket.assertConsumed();
});
