import { FomoClient, StaticSession, FomoError } from "../dist/index.js";

if (process.env.FOMO_LIVE_READS !== "1" || !process.env.FOMO_ACCESS_TOKEN) {
  console.error("Live reads require explicit FOMO_LIVE_READS=1 and FOMO_ACCESS_TOKEN.");
  process.exitCode = 1;
} else {
  try {
    const client = new FomoClient({
      session: new StaticSession({ accessToken: process.env.FOMO_ACCESS_TOKEN }),
      timeoutMs: 8000,
      maxRetries: 0,
    });
    const me = await client.users.getCurrent();
    const board = await client.leaderboards.list({ window: "24h", limit: 3 });
    console.log(
      JSON.stringify({
        currentUserParsed: Boolean(me.data.id),
        leaderboardRows: board.data.length,
        transport: "native-impit",
      }),
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        kind: error instanceof FomoError ? error.kind : "unexpected",
        status: error instanceof FomoError ? error.status : undefined,
      }),
    );
    process.exitCode = 1;
  }
}
