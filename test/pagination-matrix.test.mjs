import test from "node:test";
import assert from "node:assert/strict";
import { client, response, envelope, swap } from "./helpers.mjs";
for (const maxPages of [1, 2, 3])
  for (const maxItems of [1, 2, 3, 4, 10])
    test(`pagination budget maxPages=${maxPages}/maxItems=${maxItems}`, async () => {
      const all = ["a", "b", "c", "d"];
      const { client: c, calls } = client((request) => {
        const cursor = new URL(request.url).searchParams.get("lastSwapIdV2");
        const start = cursor === null ? 0 : all.indexOf(cursor) + 1;
        const ids = all.slice(start, start + 2);
        return response(envelope({ swaps: ids.map(swap), hasNextPage: start + 2 < all.length }));
      });
      const pages = [];
      for await (const page of c.swaps.pages({ userId: "actor" }, { maxPages, maxItems }))
        pages.push(page);
      const expected = Math.min(4, maxPages * 2, maxItems);
      assert.deepEqual(
        pages.flatMap((page) => page.data.map((item) => item.id)),
        all.slice(0, expected),
      );
      assert.equal(calls.length, Math.ceil(expected / 2));
      const last = pages.at(-1);
      assert.equal(
        last.pageInfo.stopReason,
        expected === 4 ? "end" : expected === maxItems ? "max_items" : "max_pages",
      );
      if (expected < 4) {
        assert.equal(last.pageInfo.nextCursor, all[expected - 1]);
        const resumed = await c.swaps.list({ userId: "actor", cursor: last.pageInfo.nextCursor });
        assert.equal(resumed.data[0].id, all[expected]);
      }
    });
for (const key of ["maxPages", "maxItems"])
  for (const value of [0, -1, 1.5, NaN, Infinity])
    test(`invalid pagination budget ${key}/${value}`, async () => {
      const { client: c, calls } = client(() => {
        throw new Error("unexpected");
      });
      await assert.rejects(
        async () => {
          for await (const _page of c.swaps.pages({ userId: "actor" }, { [key]: value })) {
          }
        },
        { kind: "configuration" },
      );
      assert.equal(calls.length, 0);
    });
for (const hasNextPage of [true, false])
  for (const items of [[], [swap("a")]])
    test(`empty/terminal page hasNext=${hasNextPage}/rows=${items.length}`, async () => {
      const { client: c } = client(() => response(envelope({ swaps: items, hasNextPage })));
      if (hasNextPage && !items.length)
        await assert.rejects(c.swaps.list({ userId: "actor" }), { kind: "pagination" });
      else assert.equal((await c.swaps.list({ userId: "actor" })).data.length, items.length);
    });
