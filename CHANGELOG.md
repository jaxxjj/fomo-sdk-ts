# Changelog

## Unreleased

- Fixed omitted chain-scope context: default to the qualified website networks,
  preserve explicit restrictions and fail incompatible token-scoped reads early.
  Response metadata exposes the sent scope; historical recordings use explicit
  null scope rather than silently changing their original request context.
- Completed cassette-backed domain models for the read expansion, including
  comments/reactions, holders, clan members/holdings, portfolio positions,
  nested balances, trade transfers and stable configuration fields.
- Replaced summary-only confidence with full parsed goldens, independent
  raw-value assertions and malformed-field mutation tests.

- Expanded the first-party website read inventory and public resources from
  8 to 45 methods: market discovery/search, token metrics/details/warnings/bars,
  social/user graph, portfolio snapshots, trade details/comments, clan reads,
  watchlist reads and application configuration.
- Added a strict read-query POST allowlist and body forwarding through both
  transports, preserving common session/deadline/retry/redirect boundaries.
- Added token-feed pagination and activity/swap filters observed in the website.
- Added 45 native read qualification scenarios, scrubbed replay fixtures and
  an independent website capability inventory with explicit deferred/excluded routes.
- No write/execution capability, automatic authentication or npm publication.

## 0.1.0 — 2026-09-08

- Accept explicit `userId: null` in activity and token feeds without dropping
  events or breaking the page. Missing/invalid normalized actors still reject.
  Public `Activity.userId` is `string | null`; consumers must handle both.

- Fixed a boundary-test finding: Privy credential parsing now preserves wire
  types instead of converting numeric tokens into strings. Duplicate keys remain
  rejected, and public application header overrides must be strings.

- Added exhaustive public-resource inventory checks, finite parameter/failure and
  pagination-budget matrices, and cross-resource simultaneous-refresh coverage.
- Added serial native read qualification across sampled actors/tokens/networks
  with an explicit result ledger and generated coverage report freshness gate.

- Added test-only HTTP record/replay with explicit read-only recording,
  lossless scrubbing, strict offline matching and atomic fixture replacement.
- Added real HTTP fixtures and separate synthetic/live WS traces; no runtime API change.
- Historical live activity failures are retained as evidence; post-fix replay
  accepts the complete captured pages including null actors.

Initial independent, read-only Fomo SDK.

- Native Impit transport plus explicit fetch injection and origin-bound requests.
- Static/refreshable sessions with single-flight, generation-aware rejection,
  ignore/set/clear handling and optional atomic-persistence hook.
- User, leaderboard, swaps, activity, token-feed and holder resources.
- Decimal-string normalization from raw JSON numeric lexemes; safe integer counts.
- Bounded swaps iteration, cancellation, response sizes, concurrency, queueing,
  shared cooldown and typed redacted errors.
- Experimental Privy refresher and current-account WS stream with explicit gaps,
  bounded reconnects/backpressure and cancellation cleanup.
- Synthetic contract/adversarial tests, exact package-consumer checks and CI.

No real-expiry refresh qualification, lossless streaming guarantee,
trading or private-key functionality is claimed.
