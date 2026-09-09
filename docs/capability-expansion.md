# feat: close the website-to-SDK read capability gap

## 1. Background

The old inventory asserted coverage of methods already implemented by the SDK.
It did not prove coverage of the website's data-access surface. First-party
modules reveal additional read-only POST queries and unwrapped GET resources.

## 2. End-to-end behavior

Expose verified read-only market, token, social/user, portfolio and clan
queries through the same session/deadline/rate-limit/precision boundaries.
Keep external endpoint discovery status separate from SDK method coverage.
Do not add trading, refresh-transaction, profile edits, follow/watchlist writes,
reactions, key export or implicit browser credential loading.

## 3. Evidence and scope

First-party module manifest `manifest-233aac45.js` and observed modules:
`token-v2-4ieMYzTK`, `authenticated-v2-BvR7pQsL`, `user-v2-C8F1J3r-`,
`clans-v2-HJZK85bM`, `following-v2-C6QrY2rb`, `portfolio-v2-lrIi0ZuJ`,
`GlobalFeed-v2-Bj8s197w`, `userPositionModal-v2-BYb2aQqr`,
`TokenSummary-v2-sJiwxnln`. Read their request contracts without copying
implementation code. Native live probes remain a separate gate.

## 4. Change specification

- Add an allowlisted read-query POST seam, preserving GET compatibility and
  forwarding bodies through both existing transport implementations.
- Add resource-local methods for independently observed request contracts.
  Preserve partially qualified responses as lossless source objects instead of
  inventing domain fields; provide stronger types where shapes are verified.
- Add source capability inventory with discovered/browser/native/wrapped
  evidence, including explicit exclusions and unverified parameter variants.
- Extend existing feed/swap filters where the first-party caller demonstrates
  support; do not claim cursor completeness from a single page.
- Test assets and upstream bundles remain outside the npm artifact. No version
  publication or Git push is included in this task.

## 5. Verification

Native reads are serial, bounded and stop on auth/access/rate limits. Record
sanitized response fixtures and replay through actual SDK methods. Test safe
POST allowlists, exact bodies, cancellation/retry and redirect handling,
invalid parameters, numeric precision, nullable fields and full response
envelopes. Run `npm run check` and runtime coverage floors.

E2E Required: yes for bounded SDK-to-provider reads; no external mutations.
An endpoint discovered in source is not called supported until its status is
explicitly qualified. This is bounded website-build coverage, not a promise
that undocumented/mobile/server-only endpoints have all been discovered.
