# First-party website capability inventory

Date: 2026-09-09. Scope: selected authenticated desktop website modules, not
server/mobile/private API completeness. The original SDK-method inventory was
not a website-surface inventory; this document closes that evidence distinction.

## Evidence levels

- **Source-discovered**: a first-party module contains a read invocation.
- **Browser-observed**: the website made that request and returned a response.
- **Native-qualified**: an independent Node/Impit request succeeded.
- **SDK-replayed**: the actual resource method succeeded live and its scrubbed
  response is replayed offline with exact request matching.
- **Deferred/excluded**: discovered but not claimed as a supported SDK method.

The machine-readable results are [discovered-qualification.json](discovered-qualification.json).
The independent request scenarios are in `test/support/discovered-cases.mjs`.
All listed new SDK methods below have SDK-replayed evidence. Empty/partial
responses qualify routing and parsing, not populated business coverage.

## Read capabilities wrapped in this change

| Domain / SDK methods                                                                   | First-party HTTP routes                                                                                                       | Available information / limits                                                                                                                        |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `market.list`                                                                          | POST `/proxy/trendingTokens`, `/proxy/mostHeld`, `/proxy/graduatedTokens`, `/proxy/cryptoTokens`; GET `/proxy/verifiedTokens` | Token discovery and metrics. No invented server-side limit/chain filter; lists can span networks.                                                     |
| `market.search`                                                                        | POST `/proxy/filterTokensSearch`                                                                                              | `{phrase}` or `{token}` search. One address sample returned an empty list; absence is not proof a token does not exist.                               |
| `market.allowlist`                                                                     | GET `/tokenAllowList/detailed`                                                                                                | Provider allowlist and categories; source-level object.                                                                                               |
| `tokens.metrics`                                                                       | POST `/proxy/filterTokens`                                                                                                    | Array of `address:networkId`; priceUSD, marketCap, liquidity, change/volume windows, holders and token metadata. Responses may omit requested tokens. |
| `tokens.details`                                                                       | POST `/proxy/tokenDetails`                                                                                                    | Buy/sell count and volume, unique actors, holders and top-10 concentration; source-level object.                                                      |
| `tokens.warnings`                                                                      | POST `/proxy/tokenWarnings`                                                                                                   | Disable-buy/sell flags and provider warning records. Not an independent contract safety verdict.                                                      |
| `tokens.bars`, `tokens.recentBars`                                                     | POST `/proxy/getBars`, `/proxy/getBarsNew`                                                                                    | OHLC, timestamps and volume; exact decimal normalization, parallel-column validation, no zero-filled malformed prices.                                |
| `tokens.theses`                                                                        | GET `/feed/token/thesis`                                                                                                      | Thesis page, cursor and structured comment/author-trade information.                                                                                  |
| `tokens.developerHolders`, `tokens.friendHolders`                                      | GET `/hodlers/devs`; POST `/hodlers/friends`                                                                                  | Provider developer/friend attribution, not cryptographic ownership proof.                                                                             |
| `users.getById`, `users.getMany`, `users.search`                                       | GET `/v2/users/{id}`, `/v2/users?userIds=...`, `/v2/users/fuzzy-search`                                                       | User profiles, batched users and fuzzy search. Profile fields are not uniform financial schemas.                                                      |
| `users.followingIds`, `followers`, `following`, `mutuals`, `recommended`               | GET current/followingIds and user followers/followingPaginate/mutuals/recommendedUsers                                        | Account-relative social graph and recommendations; explicit caller-managed cursors where observed, not automatic complete graph enumeration.          |
| `leaderboards.following`                                                               | GET `/v2/leaderboard/following`                                                                                               | Followed-user leaderboard.                                                                                                                            |
| `portfolio.balances`, `history`, `historyAll`, `snapshot`                              | GET user balances and `/v2/userTokens/aggregatedSnapshot`, `/interval`, `/aggregatedSnapshotById`                             | Source-reported balances and equity/PnL series; not a locally audited PnL engine.                                                                     |
| `trades.list`, `get`, `comments`                                                       | GET `/trades`, `/trades/{id}`, `/trades/{id}/comments`                                                                        | Fomo trade/position objects, not identical to per-swap executions.                                                                                    |
| `watchlist.list`                                                                       | GET `/watchlist`                                                                                                              | Read current watchlist only.                                                                                                                          |
| `feed.list`                                                                            | GET `/feed`                                                                                                                   | Aggregate/social events with repeated `feedTypes`; omitting them was live-rejected with 400.                                                          |
| `clans.leaderboard`, `search`, `get`, `feed`, `holdings`, `holdingBreakdown`, `theses` | GET clan leaderboard/search/id/feed/holdings/holdings-breakdown/thesis                                                        | Clan metrics/members/positions/content. Leaderboard returned 150 rows with limit=2; caller must not assume the server honors that limit.              |
| `app.configuration`                                                                    | GET `/config`                                                                                                                 | Application-side configuration snapshot; returned values are not stable SDK policy.                                                                   |

Existing methods retained: current-user/handle lookup, four leaderboard windows,
swaps list/bounded iterator, trading activity, token feed and top holders.

Parameter gaps also closed:

- `activity.list`: threshold, minEquity, minMarketCap, maxMarketCap.
- `tokens.feed`: explicit limit and lastId cursor, including nextCursor output.
- `swaps.list/pages`: optional tokenAddress filter.
- Repeated string query parameters are encoded as repeated keys.
- Read-only POST routes reuse session, timeout, retry, cancellation and redirect
  boundaries. A reviewed operation allowlist prevents arbitrary POST writes.

## Response semantics

The expanded resources now expose named field-level models; monetary values
remain decimal strings and known counts are safe integers. Raw extension fields
remain available. See [typed-models.md](typed-models.md) for model groups and
explicit unqualified variants, rather than treating source-object acceptance
as complete response-schema validation. No inferred zeroes, automatic percentage
conversion or invented pagination flags are added.

Native qualification on September 9 demonstrated:

- The original two-token omission was causally linked to missing
  X-Supported-Chains context, not merely a batch-size limitation. The default
  now matches the qualified website scope; deliberate restrictions are preserved.
  Unavailable assets may still be omitted and must be matched by identity.
- Empty user/watchlist/trade pages are valid and do not validate populated rows.
- The source explicitly reports cached metric results; cache TTL/freshness is
  not guaranteed by the SDK.
- Global/clan feeds require a supplied `feedTypes` selection.
- Price bars use Unix seconds; both `volume` and `v` column variants were seen.
- Config/allowlist/portfolio schemas are provider-controlled snapshots.

## Source-discovered but not wrapped

| Route/capability                                                              | Why not claimed supported yet                                                                                           |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| GET `/v2/users/{id}/spotlight`                                                | Not included in this native-qualified pass; response variants not qualified.                                            |
| GET `/feed/token/sortedThesis`                                                | Chart time-bound/sorted-thesis semantics and time units need a focused qualification.                                   |
| GET `/proxy/relay/appFees`                                                    | Account reward/claim balance path; outside the selected data-query expansion. No claim operations implemented.          |
| Additional thesis `followingOnly`, `orderBy`, `afterTime`, `beforeTime` modes | Visible in source but not claimed as tested combinations.                                                               |
| Graph/feed/trade continuation across all endpoint variants                    | Only source cursor names and selected first pages are covered; exhaustive historical completion is not claimed.         |
| WS market topics                                                              | Trending/prices protocol samples exist, but public experimental SDK stream still exposes current-account activity only. |
| Upstream since-cursor metric change log                                       | Not established; snapshot HTTP queries do not recover every intermediate change.                                        |

## Intentionally excluded writes

Observed mutation paths include profile edit/upload/twitter-cache invalidation,
`/follows`, POST/DELETE `/watchlist`, `/feed/react`, `/feed/unreact`,
`/trades/comment`, push-token preferences, referral actions, `/swaps/*`,
relay claim/execute permit paths, and clan-management UI. They must not be
enabled simply because their paths are present in an authenticated module.
No new authentication, signing, private-key export, transaction submission or
background collector was added.

## Discovery provenance and refresh

First-party manifest: `https://fomo.family/assets/manifest-233aac45.js`.
Observed manifest SHA-256:
`fb964ffdc6b58053cba58d1d48ba61fd9b899625ca5bdbc7d5830412d4d3fc07`.
Selected module versions: token-v2-4ieMYzTK, authenticated-v2-BvR7pQsL,
user-v2-C8F1J3r-, clans-v2-HJZK85bM, following-v2-C6QrY2rb,
portfolio-v2-lrIi0ZuJ, GlobalFeed-v2-Bj8s197w,
userPositionModal-v2-BYb2aQqr, TokenSummary-v2-sJiwxnln.
Additional selected page/transport modules were inspected for references.
Temporary research artifacts are outside the package/repository; proprietary
website implementation code is not copied into this SDK.

For subsequent updates, inspect the new first-party manifest/module call sites
and update this inventory before testing SDK methods. CI checks internal
inventory/test consistency; it does **not** scrape a logged-in website or prove
that the upstream has not added another endpoint since this dated inspection.
