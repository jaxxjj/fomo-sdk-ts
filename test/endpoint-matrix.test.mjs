import test from "node:test";
import assert from "node:assert/strict";
import { FomoClient, StaticSession } from "../dist/index.js";
import { client, response, envelope } from "./helpers.mjs";
import { matrix, methods, invoke, fixtureBody } from "./support/endpoint-matrix.mjs";

test("resource inventory covers every public resource method", () => {
  const c = new FomoClient({ session: new StaticSession({ accessToken: "synthetic" }) });
  const actual = ["users", "leaderboards", "swaps", "activity", "tokens"].flatMap((resource) =>
    Object.getOwnPropertyNames(Object.getPrototypeOf(c[resource]))
      .filter((n) => n !== "constructor")
      .map((n) => `${resource}.${n}`),
  );
  assert.deepEqual(actual.sort(), methods.slice().sort());
  assert.deepEqual([...new Set(matrix.map((row) => row.name))].sort(), methods.slice().sort());
});
for (const row of matrix)
  test(`wire matrix ${row.name}/${row.variant}`, async () => {
    const before = structuredClone(row.args);
    const { client: c, calls } = client(() => response(envelope(fixtureBody(row))), {
      supportedChains: "1,56,143,4663,8453,1399811149",
    });
    const out = await invoke(c, row.name, row.args);
    assert.equal(calls.length, 1);
    const url = new URL(calls[0].url);
    assert.equal(url.origin, "https://prod-api.fomo.family");
    assert.equal(url.pathname, row.path);
    assert.deepEqual(
      Object.fromEntries(url.searchParams),
      Object.fromEntries(Object.entries(row.query).map(([k, v]) => [k, String(v)])),
    );
    assert.equal(calls[0].method, "GET");
    assert.equal(calls[0].headers["x-supported-chains"], "1,56,143,4663,8453,1399811149");
    const result = row.name === "swaps.pages" ? out[0] : out;
    assert.equal(result.meta.operation, row.name === "swaps.pages" ? "swaps.list" : row.name);
    if (result.pageInfo) assert.equal(result.pageInfo.sourceCount, 1);
    assert.deepEqual(row.args, before);
  });
for (const name of methods) {
  const row = matrix.find((r) => r.name === name);
  for (const [status, kind] of [
    [401, "authentication"],
    [403, "access_denied"],
    [430, "access_denied"],
    [429, "rate_limited"],
    [503, "http"],
  ])
    test(`failure matrix ${name}/${status}`, async () => {
      const { client: c, calls } = client(() => response({ secret: "matrix-secret" }, status));
      await assert.rejects(invoke(c, name, row.args), (error) => {
        assert.equal(error.kind, kind);
        assert.ok(!JSON.stringify(error).includes("matrix-secret"));
        return true;
      });
      assert.equal(calls.length, 1);
    });
  test(`malformed envelope matrix ${name}`, async () => {
    const { client: c } = client(() => response({ success: true, statusCode: 200 }));
    await assert.rejects(invoke(c, name, row.args), { kind: "protocol" });
  });
  test(`pre-abort matrix ${name}`, async () => {
    const { client: c, calls } = client(() => response(envelope(fixtureBody(row))));
    const args = structuredClone(row.args);
    const request = { ...(name === "swaps.pages" ? args[1] : {}), signal: AbortSignal.abort() };
    if (name === "users.getCurrent") args[0] = request;
    else args[1] = request;
    await assert.rejects(invoke(c, name, args), { kind: "aborted" });
    assert.equal(calls.length, 0);
  });
}
for (const limit of [-1, 0, 201, 1.5, NaN, Infinity, null, "1"])
  for (const name of ["leaderboards.list", "activity.list"])
    test(`invalid limit ${name}/${String(limit)}`, async () => {
      const { client: c, calls } = client(() => {
        throw new Error("unexpected send");
      });
      await assert.rejects(invoke(c, name, [{ limit }]), { kind: "configuration" });
      assert.equal(calls.length, 0);
    });
for (const networkId of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "56", null])
  for (const name of ["tokens.feed", "tokens.holders"])
    test(`invalid network ${name}/${String(networkId)}`, async () => {
      const { client: c, calls } = client(() => {
        throw new Error("unexpected send");
      });
      await assert.rejects(invoke(c, name, [{ token: { address: "mint", networkId } }]), {
        kind: "configuration",
      });
      assert.equal(calls.length, 0);
    });
for (const threshold of [-1, NaN, Infinity, "1", null])
  test(`invalid threshold ${String(threshold)}`, async () => {
    const { client: c, calls } = client(() => {
      throw new Error("unexpected send");
    });
    await assert.rejects(c.tokens.feed({ token: { address: "mint", networkId: 56 }, threshold }), {
      kind: "configuration",
    });
    assert.equal(calls.length, 0);
  });
for (const type of [
  "swap_buy",
  "swap_sell",
  "thesis",
  "transfer_in",
  "transfer_out",
  "swap_withdraw",
  "future",
])
  for (const userId of ["actor", null, undefined])
    test(`activity actor/type ${type}/${String(userId)}`, async () => {
      const item = {
        id: "event",
        createdAt: "2026-09-08T00:00:00Z",
        type,
        ...(userId === undefined ? {} : { userId }),
      };
      const { client: c } = client(() => response(envelope({ items: [item], hasNextPage: false })));
      if (typeof userId === "string" || userId === null)
        assert.equal((await c.activity.list()).data[0].userId, userId);
      else await assert.rejects(c.activity.list(), { kind: "protocol", reason: "invalid_user_id" });
    });
