# Changelog

## 0.1.0 — unreleased

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
