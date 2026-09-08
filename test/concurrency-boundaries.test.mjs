import test from "node:test";
import assert from "node:assert/strict";
import { Scheduler } from "../dist/http/scheduler.js";
import { BoundedQueue } from "../dist/internal/queue.js";
import { client, response, envelope, user } from "./helpers.mjs";

test("scheduler drains FIFO, removes canceled waiters and releases exactly once", async () => {
  const scheduler = new Scheduler(1, 2);
  const signal = new AbortController().signal;
  const release = await scheduler.acquire(signal);
  const aborted = new AbortController();
  const canceled = scheduler.acquire(aborted.signal);
  const canceledCheck = assert.rejects(canceled, { kind: "aborted" });
  const next = scheduler.acquire(signal);
  await assert.rejects(scheduler.acquire(signal), { kind: "queue_full" });
  aborted.abort();
  await canceledCheck;
  release();
  release();
  const releaseNext = await next;
  const last = scheduler.acquire(signal);
  let granted = false;
  void last.then(() => {
    granted = true;
  });
  await Promise.resolve();
  assert.equal(granted, false, "Duplicate release created extra capacity");
  releaseNext();
  (await last)();
  (await scheduler.acquire(signal))();
  await assert.rejects(scheduler.acquire(AbortSignal.abort()), { kind: "aborted" });
});
test("HTTP concurrency includes response completion; queued reads drain after release", async () => {
  const pending = [];
  let active = 0,
    maxActive = 0;
  const { client: c } = client(
    async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => pending.push(resolve));
      active--;
      return response(envelope(user()));
    },
    { maxConcurrency: 2, maxQueueSize: 3 },
  );
  const requests = Array.from({ length: 5 }, () => c.users.getCurrent());
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(active, 2);
  assert.equal(pending.length, 2);
  for (let done = 0; done < 5; done++) {
    const finish = pending.shift();
    assert.equal(typeof finish, "function");
    finish();
    await new Promise((resolve) => setImmediate(resolve));
    assert.ok(active <= 2);
  }
  await Promise.all(requests);
  assert.equal(maxActive, 2);
  assert.equal(active, 0);
});
test("stream queue preserves FIFO, rejects concurrent consumers and honors termination", async () => {
  const queue = new BoundedQueue(2);
  queue.push("a");
  queue.push("b");
  assert.equal((await queue.next()).value, "a");
  assert.equal((await queue.next()).value, "b");
  const waiting = queue.next();
  await assert.rejects(queue.next(), {
    kind: "configuration",
    reason: "concurrent_stream_consumer",
  });
  queue.push("c");
  assert.equal((await waiting).value, "c");
  const end = queue.next();
  queue.end();
  assert.equal((await end).done, true);
  queue.push("ignored");
  assert.equal((await queue.next()).done, true);
  const failed = new BoundedQueue(1);
  const wait = failed.next();
  const error = new Error("fixture");
  const rejected = assert.rejects(wait, error);
  failed.fail(error);
  await rejected;
  failed.push("ignored");
  failed.fail(new Error("later"));
  await assert.rejects(failed.next(), error);
});
