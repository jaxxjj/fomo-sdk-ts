import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Cassette, Redactor, providerPolicy } from "./support/cassette.mjs";
const origin = "https://prod-api.fomo.family";
const headers = {
  authorization: "Bearer synthetic-secret-token",
  "content-type": "application/json",
};
function file(t) {
  const dir = mkdtempSync(join(tmpdir(), "cassette-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return join(dir, "case.json");
}
function recorder(t, options = {}) {
  return new Cassette({
    file: file(t),
    policy: providerPolicy("fomo"),
    mode: "record",
    provenance: { kind: "synthetic" },
    ...options,
  });
}

test("recorded copy is scrubbed without changing caller data or numeric wire types", async (t) => {
  const id = "53ba7f74-cc4c-4000-9000-abcdefabcdef";
  const raw = `{"success":true,"statusCode":200,"responseObject":{"id":"${id}","userId":"${id}","displayName":"Private Name","amount":900719925474099312345,"decimal":1.2300,"asString":"0.000000000000000001","accessToken":"synthetic-secret-token"}}`;
  const rr = recorder(t, { inputs: { userId: id } });
  const reply = await rr.fetch(async () => new Response(raw))(`${origin}/v2/users/current`, {
    headers,
  });
  assert.equal(await reply.text(), raw);
  rr.commit();
  const text = readFileSync(rr.file, "utf8");
  assert.ok(!text.includes("Private Name"));
  assert.ok(!text.includes("synthetic-secret-token"));
  assert.ok(!text.includes(id));
  const data = JSON.parse(text);
  assert.match(data.exchanges[0].response.body, /"amount":900719925474099312345/);
  assert.match(data.exchanges[0].response.body, /"decimal":1.2300/);
  assert.match(data.exchanges[0].response.body, /"asString":"0.000000000000000001"/);
  const body = JSON.parse(data.exchanges[0].response.body);
  assert.equal(body.responseObject.id, body.responseObject.userId);
  assert.equal(data.inputs.userId, body.responseObject.id);
});
test("replay never calls a supplied live transport", async (t) => {
  const rr = recorder(t);
  await rr.fetch(async () => new Response('{"success":true,"statusCode":200,"responseObject":{}}'))(
    `${origin}/v2/users/current`,
    { headers },
  );
  rr.commit();
  let calls = 0;
  const replay = new Cassette({ file: rr.file, policy: providerPolicy("fomo") });
  const fetch = replay.fetch(async () => {
    calls++;
    throw new Error("live fallback");
  });
  assert.equal((await fetch(`${origin}/v2/users/current`, { headers })).status, 200);
  await assert.rejects(fetch(`${origin}/v2/users/current?unexpected=1`, { headers }), /Unmatched/);
  assert.equal(calls, 0);
  replay.assertConsumed();
});
test("missing fixtures do not implicitly record", (t) => {
  assert.throws(() => new Cassette({ file: file(t), policy: providerPolicy("fomo") }), /ENOENT/);
});
test("response order and exhaustion are preserved for repeated requests", async (t) => {
  const rr = recorder(t);
  let call = 0;
  const wrapped = rr.fetch(async () => new Response("{}", { status: ++call === 1 ? 429 : 200 }));
  await wrapped(`${origin}/v2/users/current`, { headers });
  await wrapped(`${origin}/v2/users/current`, { headers });
  rr.commit();
  const replay = new Cassette({ file: rr.file, policy: providerPolicy("fomo") });
  const fetch = replay.fetch();
  assert.equal((await fetch(`${origin}/v2/users/current`, { headers })).status, 429);
  assert.throws(() => replay.assertConsumed(), /Unused/);
  assert.equal((await fetch(`${origin}/v2/users/current`, { headers })).status, 200);
  await assert.rejects(fetch(`${origin}/v2/users/current`, { headers }), /exhausted/);
  replay.assertConsumed();
});
test("unknown live operations including writes fail before delegation", async (t) => {
  const rr = recorder(t);
  let calls = 0;
  await assert.rejects(
    rr.fetch(async () => {
      calls++;
      return new Response("{}");
    })(`${origin}/v2/users`, { method: "POST", headers, body: "{}" }),
    /forbidden/,
  );
  assert.equal(calls, 0);
  assert.throws(() => rr.commit(), /Failed/);
});
test("failed recording preserves existing cassette", async (t) => {
  const path = file(t);
  writeFileSync(path, "previous");
  const rr = recorder(t, { file: path });
  await assert.rejects(
    rr.fetch(async () => new Response("not-json"))(`${origin}/v2/users/current`, { headers }),
  );
  assert.throws(() => rr.commit(), /Failed/);
  assert.equal(readFileSync(path, "utf8"), "previous");
});
test("wrong identities are not normalized into a match during replay", async (t) => {
  const rr = recorder(t);
  await rr.fetch(async () => new Response("{}"))(
    `${origin}/v2/users/53ba7f74-cc4c-4000-9000-abcdefabcdef/swaps`,
    { headers },
  );
  rr.commit();
  const replay = new Cassette({ file: rr.file, policy: providerPolicy("fomo") });
  await assert.rejects(
    replay.fetch()(`${origin}/v2/users/11111111-2222-3333-4444-555555555555/swaps`, { headers }),
    /Unmatched/,
  );
});
test("scrubbing authentication still checks its presence", async (t) => {
  const rr = recorder(t);
  let calls = 0;
  await assert.rejects(
    rr.fetch(async () => {
      calls++;
      return new Response("{}");
    })(`${origin}/v2/users/current`, {}),
    /authentication/,
  );
  assert.equal(calls, 0);
});
test("GMGN normalization only removes authentication volatility", () => {
  const policy = providerPolicy("gmgn");
  const redact = new Redactor();
  const h = { "X-APIKEY": "synthetic-key" };
  const base = "https://openapi.gmgn.ai/v1/user/kol?chain=sol&limit=2";
  const a = policy.request(
    base + "&timestamp=123&client_id=11111111-1111-4111-8111-111111111111",
    { headers: h },
    redact,
    true,
  );
  const b = policy.request(
    base + "&timestamp=999&client_id=22222222-2222-4222-8222-222222222222",
    { headers: h },
    redact,
    false,
  );
  assert.deepEqual(a, b);
  assert.throws(() => policy.request(base, { headers: h }, redact, false), /timestamp/);
});
test("concurrent recordings retain request invocation order and cannot commit in flight", async (t) => {
  const rr = recorder(t);
  let resolveFirst;
  let calls = 0;
  const fetch = rr.fetch(() =>
    ++calls === 1
      ? new Promise((resolve) => {
          resolveFirst = resolve;
        })
      : Promise.resolve(new Response('{"order":2}')),
  );
  const first = fetch(`${origin}/v2/users/current`, { headers });
  await fetch(`${origin}/v2/users/current`, { headers });
  assert.throws(() => rr.commit(), /in flight/);
  resolveFirst(new Response('{"order":1}'));
  await first;
  rr.commit();
  const replay = new Cassette({ file: rr.file, policy: providerPolicy("fomo") });
  assert.deepEqual(await (await replay.fetch()(`${origin}/v2/users/current`, { headers })).json(), {
    order: 1,
  });
  assert.deepEqual(await (await replay.fetch()(`${origin}/v2/users/current`, { headers })).json(), {
    order: 2,
  });
  replay.assertConsumed();
});
test("oversized and duplicate-key responses cannot become fixtures", async (t) => {
  for (const raw of ['{"x":1,"x":2}', JSON.stringify({ value: "x".repeat(1024 * 1024) })]) {
    const rr = recorder(t);
    await assert.rejects(
      rr.fetch(async () => new Response(raw))(`${origin}/v2/users/current`, { headers }),
    );
    assert.throws(() => rr.commit(), /Failed/);
  }
});
test("aborted capture does not save a truncated valid JSON prefix", async (t) => {
  const rr = recorder(t);
  const controller = new AbortController();
  let reads = 0;
  const stream = new ReadableStream({
    pull(c) {
      if (reads++ === 0) c.enqueue(new TextEncoder().encode("{}"));
      else controller.abort();
    },
  });
  await assert.rejects(
    rr.fetch(async () => new Response(stream))(`${origin}/v2/users/current`, {
      headers,
      signal: controller.signal,
    }),
    /aborted/,
  );
  assert.throws(() => rr.commit(), /Failed/);
});
test("an embedded address must not preserve surrounding personal prose", () => {
  const redactor = new Redactor();
  const address = "0x1234567890123456789012345678901234567890";
  assert.equal(redactor.body(`Contact private@example.test about ${address}`), "[redacted text]");
  assert.match(redactor.body(`${address}:56`), /^0x[0-9a-f]{40}:56$/);
  assert.notEqual(redactor.body(address), address);
});
test("wallet-keyed response maps are pseudonymized consistently", () => {
  const redact = new Redactor();
  const wallet = "0x1234567890123456789012345678901234567890";
  const out = redact.body({ [wallet]: { wallet_address: wallet, balance: 1 } });
  const alias = Object.keys(out)[0];
  assert.notEqual(alias, wallet);
  assert.equal(out[alias].wallet_address, alias);
});
test("recording policy allows read POSTs but never financial POSTs", () => {
  const policy = providerPolicy("gmgn");
  for (const path of [
    "/v1/user/wallet_profits",
    "/v1/trenches",
    "/v1/market/token_signal",
    "/v1/market/hot_searches",
  ])
    assert.equal(policy.allowRecord("POST", path), true);
  for (const path of [
    "/v1/trade/swap",
    "/v1/trade/multi_swap",
    "/v1/trade/strategy/create",
    "/v1/trade/strategy/cancel",
    "/v1/cooking/create_token",
  ])
    assert.equal(policy.allowRecord("POST", path), false);
});
test("non-JSON HTTP failures preserve status without retaining error-page content", async (t) => {
  const rr = recorder(t);
  const original = "<html>private account and synthetic-secret-token</html>";
  const result = await rr.fetch(
    async () => new Response(original, { status: 429, headers: { "retry-after": "1" } }),
  )(`${origin}/v2/users/current`, { headers });
  assert.equal(result.status, 429);
  assert.equal(await result.text(), original);
  rr.commit();
  const text = readFileSync(rr.file, "utf8");
  assert.ok(!text.includes("private account"));
  assert.ok(!text.includes("synthetic-secret-token"));
  const replay = new Cassette({ file: rr.file, policy: providerPolicy("fomo") });
  const response = await replay.fetch()(`${origin}/v2/users/current`, { headers });
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "1");
  replay.assertConsumed();
});
