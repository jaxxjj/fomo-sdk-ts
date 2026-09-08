import test from "node:test";
import assert from "node:assert/strict";
import { client, response, envelope, activity } from "./helpers.mjs";

test("mixed attributed and unattributed activity is preserved with the original cursor", async () => {
  const items = [activity("attributed"), { ...activity("unattributed"), userId: null }];
  const { client: c } = client(() => response(envelope({ items, hasNextPage: true })));
  const result = await c.activity.list();
  assert.deepEqual(
    result.data.map((row) => row.id),
    ["attributed", "unattributed"],
  );
  assert.equal(result.data[0].userId, "synthetic-user");
  assert.equal(result.data[1].userId, null);
  assert.equal(result.pageInfo.sourceCount, 2);
  assert.equal(result.pageInfo.nextCursor, "unattributed");
});

test("token feed also retains events with a null actor", async () => {
  const { client: c } = client(() =>
    response(
      envelope({
        items: [{ ...activity("unattributed"), userId: null }],
        hasNextPage: false,
      }),
    ),
  );
  const result = await c.tokens.feed({ token: { address: "mint", networkId: 56 } });
  assert.equal(result.data.length, 1);
  assert.equal(result.data[0].userId, null);
});

for (const userId of [undefined, "", false, true, {}, []])
  test(`invalid normalized actor still rejects: ${JSON.stringify(userId)}`, async () => {
    const row = { ...activity("invalid"), userId };
    const { client: c } = client(() => response(envelope({ items: [row], hasNextPage: false })));
    await assert.rejects(c.activity.list(), { kind: "protocol", reason: "invalid_user_id" });
  });
