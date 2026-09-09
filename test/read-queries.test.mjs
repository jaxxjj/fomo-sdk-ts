import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import {
  FomoClient,
  StaticSession,
  createFetchTransport,
  createImpitTransport,
} from "../dist/index.js";
import { client, response, envelope, user } from "./helpers.mjs";
import { Redactor, providerPolicy } from "./support/cassette.mjs";

test("unreviewed POST operations cannot reach any transport", async () => {
  const { client: c, calls } = client(() => response(envelope({})));
  for (const operation of ["swap", "/trades/comment", "__proto__", "constructor", "watchlist.add"])
    await assert.rejects(c.connection.readQuery(operation, {}), {
      kind: "configuration",
      reason: "read_query",
    });
  assert.equal(calls.length, 0);
});
test("read-query body rejects unsupported serialization and oversized payload", async () => {
  const { client: c, calls } = client(() => response(envelope({})));
  const circular = {};
  circular.self = circular;
  for (const body of [
    circular,
    { value: 1n },
    { value: NaN },
    () => {},
    { value: "x".repeat(1024 * 1024) },
  ])
    await assert.rejects(c.connection.readQuery("tokens.details", body), {
      kind: "configuration",
      reason: "request_body",
    });
  assert.equal(calls.length, 0);
});
test("read-only POST retries preserve the exact serialized body", async () => {
  const { client: c, calls } = client(
    (_request, n) => (n === 1 ? response({}, 503) : response(envelope({ holders: 0 }))),
    { maxRetries: 1 },
  );
  const out = await c.tokens.details({ token: { address: "a/b?&", networkId: 56 } });
  assert.equal(out.data.holders, 0);
  assert.equal(calls.length, 2);
  for (const request of calls) {
    assert.equal(request.method, "POST");
    assert.equal(new URL(request.url).pathname, "/proxy/tokenDetails");
    assert.deepEqual(JSON.parse(request.body), { tokenId: "a/b?&:56" });
  }
  assert.equal(calls[0].body, calls[1].body);
});
test("POST uses the same one-time 401 renewal boundary", async () => {
  let n = 0;
  const session = {
    acquire: async () => ({ accessToken: n ? "new" : "old", generation: n ? "g2" : "g1" }),
    invalidate: () => {
      n++;
    },
  };
  const { client: c, calls } = client(
    (request) =>
      request.headers.authorization === "Bearer old"
        ? response({}, 401)
        : response(envelope({ holders: 0 })),
    { session },
  );
  await c.tokens.details({ token: { address: "mint", networkId: 56 } });
  assert.equal(n, 1);
  assert.equal(calls.length, 2);
});
for (const [name, factory] of [
  ["fetch", createFetchTransport],
  ["impit", createImpitTransport],
])
  test(`${name} forwards POST body and refuses cross-origin redirects`, async (t) => {
    let remote = 0;
    let seen;
    const other = createServer((_req, res) => {
      remote++;
      res.end("{}");
    });
    await new Promise((resolve) => other.listen(0, "127.0.0.1", resolve));
    const server = createServer(async (req, res) => {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      seen = { method: req.method, body: Buffer.concat(chunks).toString() };
      if (req.url === "/redirect") {
        res.writeHead(302, { location: `http://127.0.0.1:${other.address().port}/other` });
        res.end();
      } else res.end("{}");
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    t.after(() => {
      server.closeAllConnections();
      other.closeAllConnections();
      server.close();
      other.close();
    });
    const transport = factory();
    const request = {
      url: `http://127.0.0.1:${server.address().port}/read`,
      method: "POST",
      body: '{"value":"0.000000000000001"}',
      headers: { "content-type": "application/json", authorization: "Bearer synthetic" },
      signal: AbortSignal.timeout(5000),
    };
    const out = await transport.send(request);
    await new Response(out.body).text();
    assert.deepEqual(seen, { method: "POST", body: request.body });
    await assert.rejects(
      transport.send({ ...request, url: `http://127.0.0.1:${server.address().port}/redirect` }),
    );
    assert.equal(remote, 0);
  });
test("repeated query values survive and malformed members reject", async () => {
  const { client: c, calls } = client(() => response(envelope({ users: [user()] })));
  await c.users.getMany({ userIds: ["one/+", "two"] });
  assert.deepEqual(new URL(calls[0].url).searchParams.getAll("userIds"), ["one/+", "two"]);
  await assert.rejects(c.connection.request("test", "/read", { ids: ["okay", 42] }), {
    kind: "configuration",
  });
});
test("Fomo search token is an address, not a credential field in the recorder", () => {
  const policy = providerPolicy("fomo");
  const redact = new Redactor();
  const address = "0x1234567890123456789012345678901234567890";
  const request = policy.request(
    "https://prod-api.fomo.family/proxy/filterTokensSearch",
    {
      method: "POST",
      headers: { authorization: "Bearer synthetic" },
      body: JSON.stringify({ token: address }),
    },
    redact,
    true,
  );
  assert.equal(JSON.parse(request.body).token, redact.input(address, "tokenAddress"));
  assert.notEqual(JSON.parse(request.body).token, "<secret>");
  assert.equal(policy.allowRecord("POST", "/trades/comment"), false);
  assert.equal(policy.allowRecord("POST", "/watchlist"), false);
});
