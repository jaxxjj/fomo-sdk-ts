import test from "node:test";
import assert from "node:assert/strict";
import { RefreshableSession, FomoClient } from "../dist/index.js";
import { response, envelope } from "./helpers.mjs";
import { matrix, invoke, fixtureBody } from "./support/endpoint-matrix.mjs";

test("simultaneous 401s across resources cause one refresh, not one per endpoint", async () => {
  const rows = ["users.getCurrent", "leaderboards.list", "swaps.list"].map((name) =>
    matrix.find((row) => row.name === name),
  );
  let refreshes = 0,
    oldRequests = 0,
    newRequests = 0,
    releaseOld;
  const allOld = new Promise((resolve) => {
    releaseOld = resolve;
  });
  const session = new RefreshableSession({
    credentials: { accessToken: "old" },
    refresh: async () => {
      refreshes++;
      return { action: "set", credentials: { accessToken: "new" } };
    },
  });
  const client = new FomoClient({
    session,
    maxRetries: 0,
    transport: {
      send: async (request) => {
        if (request.headers.authorization === "Bearer old") {
          oldRequests++;
          if (oldRequests === rows.length) releaseOld();
          await allOld;
          return response({}, 401);
        }
        assert.equal(request.headers.authorization, "Bearer new");
        newRequests++;
        const row = rows.find((row) => row.path === new URL(request.url).pathname);
        return response(envelope(fixtureBody(row)));
      },
    },
  });
  await Promise.all(rows.map((row) => invoke(client, row.name, row.args)));
  assert.equal(oldRequests, 3);
  assert.equal(newRequests, 3);
  assert.equal(refreshes, 1);
});
