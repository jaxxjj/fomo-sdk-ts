# Fomo TypeScript SDK

Independent, unofficial, **read-only** Fomo SDK. Native Node.js HTTP via Impit,
explicit session management, exact decimal text and experimental streaming.

**Version 0.1.0 is under development and has not been published to npm.**
The package remains `private: true`. No browser, CLI process, credential discovery,
Keychain access or network request starts merely from importing/constructing it.

## Install from a tested local artifact

Node.js 22+; ESM only.

```sh
npm ci --ignore-scripts
npm run check
node scripts/check-package.mjs --artifact

# In your consumer project:
npm install /path/to/fomo-sdk-ts/artifacts/jaxonchenjc-fomo-sdk-0.1.0.tgz
```

## Read data

```ts
import { FomoClient, StaticSession } from "@jaxonchenjc/fomo-sdk";

const accessToken = process.env.FOMO_ACCESS_TOKEN;
if (!accessToken) throw new Error("Supply a Fomo access token");

const fomo = new FomoClient({
  session: new StaticSession({ accessToken }),
  timeoutMs: 10_000,
});

const me = await fomo.users.getCurrent();
const leaders = await fomo.leaderboards.list({ window: "24h", limit: 10 });
const swaps = await fomo.swaps.list({ userId: me.data.id });
const activity = await fomo.activity.list({ limit: 25 });
const feed = await fomo.tokens.feed({
  token: { networkId: 56, address: tokenAddress },
});
const holders = await fomo.tokens.holders({
  token: { networkId: 56, address: tokenAddress },
});
```

`tokenAddress` must be provided by the application. `networkId` is Fomo's provider
identifier, not a universal EVM chain ID. No address case conversion or ownership
inference is performed. Profile `address`/`evmAddress` are provider-reported fields.

Every result contains `data` and `meta` (operation, observation timestamp, contract
revision and opaque session generation). These methods use GET only. There are no
swap, signing, transfer, profile-upsert, follow or watchlist-write methods.

### Numbers and unknown values

**Financial values are decimal strings.** The lossless JSON decoder preserves
numeric lexemes before they can become IEEE754 doubles. Known count/network fields
are converted only after safe-integer validation. Unknown extension fields are
preserved, with unknown numeric literals also represented as decimal strings.

This is deliberate normalization: it does not claim the server sends strings.
Missing values remain missing; null stays null; neither becomes zero. No decimals,
price, USD rate, PnL or fee is invented. Unknown activity variants retain their
original `type` and use `kind: "unknown"`; transfers preserve direction.

Thesis `comment` remains structured. Holder rows are open objects until a stronger
row-level contract is qualified. See [PROTOCOL.md](PROTOCOL.md).

## Pagination and cancellation

```ts
const controller = new AbortController();
for await (const page of fomo.swaps.pages(
  { userId },
  { maxPages: 10, maxItems: 250, signal: controller.signal },
)) {
  await savePage(page); // application's own storage, not an SDK side effect
  console.log(page.pageInfo.stopReason);
}
```

Stop reasons distinguish server end from a client page/item cap. Repeated cursors
and empty nonterminal pages fail explicitly. A clipped swap page's resume cursor
names the last delivered item, not the last undispatched server item.

Activity exposes the source-derived `lastId` cursor through `cursor`; only swaps
currently have an automatic page iterator. Token-feed continuation is not
implemented: a `hasNextPage` flag is not a verified cursor contract. Reaching a
server end marker does not prove global history completeness. Cross-page
deduplication and persistent checkpoints belong to the collector.

## Sessions

`StaticSession` is useful for short-lived reads. It does not refresh. For renewal:

```ts
import { RefreshableSession } from "@jaxonchenjc/fomo-sdk";

const session = new RefreshableSession({
  credentials, // explicitly loaded by your application
  refresh: async (current, { signal }) => {
    return yourApprovedRefresher(current, signal);
    // { action: "ignore" }
    // { action: "set", credentials: updatedCredentials }
    // { action: "clear" }
  },
  // Optional: persist atomically to your application's secure credential store.
  persist: async (updated) => secureStore.save(updated),
});
```

Share one session instance across connections. Refresh is single-flight within
that instance. A cancelled caller stops waiting without cancelling another
caller's renewal. A late401 cannot invalidate a newer generation.

- `ignore` reuses an existing valid, non-rejected token.
- Expired/rejected token plus `ignore` fails authentication.
- `set` retains new material in memory before optional persistence. If persistence
  fails, the next acquisition retries persistence without spending the old refresh
  token again.
- `clear` prevents releasing credentials; reauthorization requires a new session.
- JWT expiry is a scheduling hint, not local proof of identity or authorization.

The persistence hook must settle and perform an atomic store operation. A hung
hook blocks that shared session's update; request deadlines still bound individual
callers. This SDK does **not** implement cross-process token-rotation locks:
use a single broker/owner or a suitably coordinated store integration.

### Experimental Privy adapter

```ts
import { createPrivySession } from "@jaxonchenjc/fomo-sdk/experimental/privy";

const session = createPrivySession({
  credentials: {
    accessToken,
    privyAccessToken,
    refreshToken,
    clientAuthId,
  },
  persist: async (updated) => secureStore.save(updated),
});
const fomo = new FomoClient({ session });
```

Variables above are caller-supplied secrets, not SDK-generated keys. This adapter
uses the investigated Fomo/Privy integration, is unofficial, and can break when
that integration changes. **Only an `ignore` response has been live-observed in our
preflight. True expiry, rotation, revocation and persistence remain live gates.**
Unit tests of set/clear are synthetic; they do not qualify autonomous cloud refresh.

No Google login automation, browser-token scraping, wallet-key export or automatic
credential-file writes are included.

## Native transport and errors

Impit 0.14.3 is lazily loaded by default, with Chrome-compatible networking and
HTTP/3 disabled, matching the successful preflight. It is a native HTTP client,
not a browser process. `createFetchTransport()` is available for explicitly chosen
environments. There is no automatic fallback/impersonation escalation on403/430.

Connection options:

| Option             | Default                             |
| ------------------ | ----------------------------------- |
| `timeoutMs`        | 15000, total request budget         |
| `maxRetries`       | 1 additional transient read attempt |
| `maxRetryDelayMs`  | 5000                                |
| `maxResponseBytes` | 4 MiB                               |
| `maxConcurrency`   | 4                                   |
| `maxQueueSize`     | 128                                 |

These are SDK resource bounds, **not claimed Fomo quotas**. Deadlines include
credential waits, queueing, body reads and retry waits. `Retry-After` is not
shortened to fit the budget, and cooldown is shared by a connection. 401 permits
one session invalidation/reacquisition;403/430/431 do not retry. Native adapters
reject redirects. Custom base origins/fetch/session callbacks are trusted input;
HTTP is allowed only for explicitly enabled literal loopback test origins.

`FomoError` contains safe kind/operation/reason/status/attempt/retry-delay metadata,
not raw response bodies, tokens or reflected server errors. Kinds distinguish
authentication, access denial, rate limiting, protocol, network, cancellation,
timeout, persistence, pagination and stream backpressure.

## Experimental stream

```ts
import { FomoStreamClient } from "@jaxonchenjc/fomo-sdk/experimental/stream";

const stream = new FomoStreamClient(fomo);
for await (const message of stream.activity({ signal: controller.signal })) {
  if (message.kind === "activity") await recordObservation(message);
  if (message.kind === "gap") await recordPotentialGap(message);
}
```

The stream obtains and verifies the current account through the same HTTP client
and session; arbitrary other-account subscriptions are not an API feature.
Ready means a matching account/topic ACK, not socket-open.

- Each reconnect revalidates the account and emits a potential-gap record.
- Default reconnection budget is three reconnects total, not an infinite loop.
- Queue overflow terminates with `backpressure`; it does not silently discard
  trades while claiming a healthy stream.
- Cancellation/break closes the SDK's socket and listeners.
- Built-in session providers notify credential changes; custom providers should
  implement `subscribe` or applications must abort their streams on logout.
- Data envelopes are checked, but the activity payload is an open object until
  real WS data shapes are qualified. Numeric literals remain decimal strings.
- No server resume cursor, backfill, application heartbeat or unsubscribe contract
  is invented. Quiet connections are not treated as dead just for lacking trades.
- `maxMessageBytes` bounds parsing after delivery; the native socket implementation
  may buffer a complete frame first. Use a reviewed custom socket factory if a
  transport-level payload bound is required.

## Development and release

`npm run check` runs formatting, strict typecheck, tests, and fresh tarball-consumer
installation/type validation. Test accounts, tokens and live request captures are
not fixtures. CI defines Linux Node22/24/26 and macOS Node24. The manual package
workflow produces a tested tarball and SHA256; it does not publish npm.

The core is implemented; production qualification is incomplete. See
[PROTOCOL.md](PROTOCOL.md), [SECURITY.md](SECURITY.md), and
[CHANGELOG.md](CHANGELOG.md). This is not a lossless collector, PnL engine,
backtester, wallet resolver or trading strategy.

An explicit bounded live read probe is available with `npm run test:smoke`.
It requires both `FOMO_LIVE_READS=1` and a caller-injected `FOMO_ACCESS_TOKEN`,
makes two GET calls without retries, and prints only parsing/count metadata.
Use a secret manager or an existing secure environment; do not put the token in
shell history. CI never runs this probe.
