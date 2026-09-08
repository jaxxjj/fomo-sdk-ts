export const networks = [1, 56, 143, 4663, 8453, 1399811149];
export const methods = [
  "users.getCurrent",
  "users.getByHandle",
  "leaderboards.list",
  "swaps.list",
  "swaps.pages",
  "activity.list",
  "tokens.feed",
  "tokens.holders",
];
export async function invoke(client, name, args = []) {
  const [resource, method] = name.split(".");
  const result = client[resource][method](...args);
  if (name !== "swaps.pages") return result;
  const pages = [];
  for await (const page of result) pages.push(page);
  return pages;
}
export const matrix = [];
function add(name, variant, args, path, query = {}) {
  matrix.push({ name, variant, args, path, query });
}
add("users.getCurrent", "default", [], "/v2/users/current");
for (const handle of ["fixture", "a/b?", "空 格", "literal%2F"])
  add(
    "users.getByHandle",
    `handle-${matrix.length}`,
    [{ handle }],
    `/v2/users/userHandle/${encodeURIComponent(handle)}`,
  );
for (const window of [undefined, "24h", "7d", "30d", "all"])
  for (const limit of [undefined, 1, 25, 200])
    add(
      "leaderboards.list",
      `${window ?? "default"}-${limit ?? "default"}`,
      [{ window, limit }],
      window === "all" ? "/v2/leaderboard" : `/v2/leaderboard/${window ?? "24h"}`,
      { limit: limit ?? 25 },
    );
for (const userId of ["user", "a/b?"])
  for (const cursor of [undefined, "opaque/+==", "游标"])
    add(
      "swaps.list",
      `${userId}-${cursor ?? "first"}`,
      [{ userId, cursor }],
      `/v2/users/${encodeURIComponent(userId)}/swaps`,
      cursor === undefined ? {} : { lastSwapIdV2: cursor },
    );
for (const maxPages of [1, 2])
  for (const maxItems of [1, 2, 1000]) {
    add(
      "swaps.pages",
      `${maxPages}-${maxItems}`,
      [{ userId: "user" }, { maxPages, maxItems }],
      "/v2/users/user/swaps",
    );
  }
for (const limit of [undefined, 1, 25, 200])
  for (const cursor of [undefined, "opaque/+=="])
    add(
      "activity.list",
      `${limit ?? "default"}-${cursor ?? "first"}`,
      [{ limit, cursor }],
      "/feed/tradingActivity",
      { limit: limit ?? 25, ...(cursor === undefined ? {} : { lastId: cursor }) },
    );
for (const networkId of networks) {
  const address =
    networkId === 1399811149
      ? "11111111111111111111111111111112"
      : "0x0000000000000000000000000000000000000002";
  const token = { networkId, address };
  for (const excludeThesis of [undefined, false, true])
    for (const threshold of [undefined, 0, 1, 100])
      add(
        "tokens.feed",
        `${networkId}-${excludeThesis}-${threshold}`,
        [{ token, excludeThesis, threshold }],
        "/feed/token",
        {
          networkId,
          tokenAddress: address,
          excludeThesis: excludeThesis ?? false,
          threshold: threshold ?? 0,
        },
      );
  add("tokens.holders", String(networkId), [{ token }], "/hodlers/top", {
    tokens: JSON.stringify([{ address, networkId }]),
  });
}

export function fixtureBody(row) {
  const user = { id: "fixture-user", userHandle: "fixture", totalVolume: 0, followers: 0 };
  if (row.name.startsWith("users.")) return user;
  if (row.name === "leaderboards.list") return { leaderboard: [user] };
  if (row.name.startsWith("swaps."))
    return {
      swaps: [{ id: "swap", createdAt: "2026-09-08T00:00:00Z", inAmount: 0 }],
      hasNextPage: false,
    };
  if (row.name === "tokens.holders")
    return [
      {
        networkId: row.args[0].token.networkId,
        tokenAddress: row.args[0].token.address,
        totalHolders: 0,
        topHolders: [],
      },
    ];
  return {
    items: [
      {
        id: "event",
        userId: "fixture-user",
        createdAt: "2026-09-08T00:00:00Z",
        type: "thesis",
        comment: { comment: "" },
        usdAmount: 0,
      },
    ],
    hasNextPage: false,
  };
}
