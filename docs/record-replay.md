# HTTP cassettes and WS traces

## 1. Background

Synthetic tests protect algorithms; live probes qualify current access. Between
them, retain small, scrubbed real provider responses as offline regression inputs.

## 2. Behavior

Tests replay only. Missing, unmatched, exhausted and unused interactions fail.
Only explicitly selected read scenarios may record. Successful recordings are
scrubbed in memory and atomically committed; failed recordings preserve old files.

## 3. Boundaries

Record at HttpTransport, before SDK decoding. Preserve JSON number lexemes and
number-versus-string types. Credentials never enter fixtures. IDs are consistently
pseudonymized; business timestamps and cursor relationships remain meaningful.
Keep signature/session/state-machine tests: scrubbing authentication does not
validate authentication. Live failures must never silently switch into recording.

## 4. Implementation

Test-only JSON cassette helper; provider-specific policies and named recording
scenarios; HTTP contract tests; separate frame-order WS trace player. No runtime
dependency on Worldline. Fixture provenance explicitly distinguishes live capture
from synthetic data. Market WS traces are protocol assets, not a claim the public
activity-only stream already supports market topics.

## 5. Verification

Test no-network fallback, matching, repeated requests, unused records, atomic
commit, scrubbing and precision. Run npm run check. Review every recorded file,
scan for credentials, and ensure recordings/traces are excluded from npm artifacts.
True expiry and live stream completeness remain separate qualification gates.

## Running and refreshing

`npm test` replays committed fixtures without credentials or an external network
fallback. Existing synthetic transport/session tests remain in place.

For an explicitly authorized recording, inject `FOMO_ACCESS_TOKEN` through your
local secret mechanism (never paste it into command history), then select one:

```sh
FOMO_RECORD=1 npm run test:record -- current
FOMO_RECORD=1 npm run test:record -- leaderboard
FOMO_RECORD=1 npm run test:record -- swaps
FOMO_RECORD=1 npm run test:record -- token
FOMO_RECORD=1 npm run test:record -- activity
FOMO_RECORD=1 npm run test:record:ws
FOMO_RECORD=1 npm run test:record:market -- trending
FOMO_RECORD=1 npm run test:record:market -- prices
```

`swaps` additionally needs `FOMO_RECORD_INPUTS` containing `{"userId":"..."}`;
`token` and market `prices` need `{"token":{"address":"...","networkId":1399811149}}`.
Inputs are pseudonymized consistently with the recorded responses. The scripts
do not discover tokens, refresh sessions, access keychains or export keys.
No record-all mode, trading routes or automatic fixture updates exist.

Review the diff before accepting a capture. The HTTP script commits only after
the named SDK scenario passes. Unknown strings are redacted; free-text fields,
URLs, transaction hashes and some identifiers lose semantics intentionally.
These assets test protocol shape, not identity resolution or trading correctness.
HTTP preserves FIFO per matching request key, not global cross-request order.
WS replay preserves frame order but does not reproduce wall-clock latency.

## Known live incompatibility

On September 8, 2026, `/feed/tradingActivity?limit=25` returned rows with
`userId: null`. `parseActivity` currently requires a nonempty string, so the SDK
rejects the whole page with `protocol / invalid_user_id`. `activity-rejected.json`
preserves a sanitized real response and explicitly tests that rejection.

It is not a successful activity qualification or an endorsement of this public
contract. Before changing it, decide how nullable/unattributed actors should be
represented to callers; keep null distinct from missing and do not fabricate an
identity. To refresh this negative evidence, explicitly select
`FOMO_RECORD=1 npm run test:record -- activity-rejected`.
The `activity` scenario remains a success-only capture and fails without writing
a fixture when this incompatibility occurs.

The live current-account WS trace stops at ready and contains no activity data.
Market traces exercise the production lossless JSON decoder only, not a public
market subscription API. Neither proves heartbeat behavior or lossless recovery.

## Broader qualification

`FOMO_QUALIFY=1 npm run test:qualify` uses an explicitly injected
`FOMO_ACCESS_TOKEN` to run a finite native read plan: current/other profiles,
four leaderboard windows, multiple actors and real cursors, activity pages,
and token feed/holders for tokens discovered in a real trending snapshot.
No synthetic addresses are used for live probes. Absent-network inputs remain
not qualified. Requests are serial with a pause and no SDK retries; access and
rate-limit errors stop the run.

`npm run coverage:report` regenerates [coverage.md](coverage.md).
`npm run test:coverage` measures runtime line/branch/function coverage separately.
Neither converts a negative replay into successful live qualification.
The Node 22 Linux CI job enforces a runtime floor of 95% lines, 85% branches
and 90% functions; the generated matrix freshness check runs in `npm run check`.
