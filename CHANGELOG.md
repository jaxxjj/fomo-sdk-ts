# Changelog

## 0.1.0 — unreleased

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
- Live activity capture exposed null `userId` rows rejected by the current parser.
  A negative regression preserves this known incompatibility; it is not resolved here.

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

No npm release, real-expiry refresh qualification, lossless streaming guarantee,
trading or private-key functionality is claimed.
