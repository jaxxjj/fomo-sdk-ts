import assert from "node:assert/strict";

// One registry drives both recording and replay. Only explicit read operations.
export const scenarios = {
  current: async (client) => {
    const result = await client.users.getCurrent();
    assert.equal(typeof result.data.id, "string");
    assert.equal(typeof result.data.userHandle, "string");
    return result;
  },
  leaderboard: async (client) => {
    for (const window of ["24h", "7d", "30d"]) {
      const result = await client.leaderboards.list({ window, limit: 2 });
      assert.ok(result.data.length > 0);
      for (const row of result.data) assert.equal(typeof row.id, "string");
    }
  },
  swaps: async (client, inputs) => {
    assert.equal(typeof inputs.userId, "string");
    const pages = [];
    for await (const page of client.swaps.pages({ userId: inputs.userId }, { maxPages: 2 })) {
      pages.push(page);
      assert.equal(page.data.length, page.pageInfo.sourceCount);
    }
    assert.ok(pages.length > 0);
    const ids = pages.flatMap((page) => page.data.map((row) => row.id));
    assert.equal(new Set(ids).size, ids.length, "Overlapping swap pages");
    return pages;
  },
  activity: async (client) => {
    const result = await client.activity.list({ limit: 25 });
    assert.equal(result.data.length, result.pageInfo.sourceCount);
    for (const row of result.data) assert.equal(typeof row.kind, "string");
    return result;
  },
  // Known live incompatibility; intentionally not a successful activity contract.
  "activity-rejected": async (client) => {
    await assert.rejects(client.activity.list({ limit: 25 }), {
      kind: "protocol",
      reason: "invalid_user_id",
    });
  },
  token: async (client, inputs) => {
    assert.ok(inputs.token);
    const feed = await client.tokens.feed({ token: inputs.token });
    const holders = await client.tokens.holders({ token: inputs.token });
    assert.equal(feed.data.length, feed.pageInfo.sourceCount);
    assert.ok(Array.isArray(holders.data));
    for (const row of holders.data) {
      assert.equal(row.networkId, inputs.token.networkId);
      assert.equal(row.tokenAddress, inputs.token.address);
      assert.ok(Number.isSafeInteger(row.totalHolders));
    }
  },
};
