# SDK qualification expansion

## 1. Objective

Inventory every public HTTP resource method and stream/session capability.
Distinguish offline combinations, successful live samples and known failures.

## 2. Scope

HTTP: both user lookups, four leaderboard windows, swaps list/pages, activity,
token feed and holders. Exercise limits, cursor boundaries, optional filters,
network IDs, empty/null/missing values and session failures. Live reads use small
limits and caller-provided inputs; no account mutation or private-key operations.

## 3. Design

Build an executable case matrix independent of production request generation.
Test actual SDK methods with injected transports. Expand explicit recording
allowlists only for reviewed GET resources. Preserve unsuccessful live responses
as labeled negative evidence; do not relax contracts merely to pass tests.

## 4. Boundaries

The approved release fix accepts explicit null activity actors while preserving
missing/invalid-field rejection. Historical capture outcomes remain unchanged;
post-fix replay is tested separately. Activity stream qualification is
distinct from market protocol probes. Real refresh rotation and gap recovery
cannot be inferred from synthetic tests or a successful reconnect.

Boundary tests found a separate auth bug: financial-number decoding promoted
JSON numeric credentials into strings. The narrowly scoped fix preserves wire
types for Privy credentials and rejects non-string application header overrides;
it does not change the public API or claim live refresh rotation qualification.

## 5. Verification

Run parameter/boundary/failure combinations offline, then finite rate-limited
native reads across sampled networks and actors. Record response shapes and
explicitly classify failures. Replay fixtures, scan identities/credentials and
run `npm run check`, including exact tarball validation. No push or publication.
