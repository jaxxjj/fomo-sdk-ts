# Protocol evidence and qualification

Date: 2026-09-08. This is an independently implemented unofficial SDK.
No code was copied wholesale from community repositories without licenses.

## Sources

- `ajagatobby/fomo`, inspected commit
  `2d28fe29ff956e1ff336755d9e07d1855bbedb8e`: HTTP paths, cursor names,
  Privy headers and native-session/WS approach. Public source, no license found;
  protocol research only.
- `ftenexov/fomo-sapiens`, inspected commit
  `6ce69e4154c1c7993876d9fbb5b9ec717cc7b6e9`: additional protocol reference;
  MIT. Different refresh-header behavior exists; not silently combined.
- Our authorized read-only preflight on2026-09-08: browser-context API shapes,
  native Impit reads, and native/browser WS control messages.

Repository URLs:

- https://github.com/ajagatobby/fomo
- https://github.com/ftenexov/fomo-sapiens
- https://github.com/apify/impit
- https://github.com/josdejong/lossless-json

Dependencies retain their own licenses: Impit is Apache-2.0; lossless-json is MIT.
Dependency code/native binaries are not bundled into this package tarball.

## Evidence is not interchangeable

Tests here use hand-built **synthetic** data. They test local contracts and failure
modes, never pretend to be authenticated captures. Preflight summaries were
redacted field/type observations, not complete replay fixtures.

| Capability                 | Evidence and limitation                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------- |
| Current user / leaderboard | Real200 responses; native Node+Impit account matched                                              |
| Swaps                      | Browser-context real empty page and two25-row pages, no cross-page ID overlap in that sample      |
| Activity                   | Real200 responses with items/hasNextPage; one transient500 also observed                          |
| Token feed / holders       | Real200 on one token/network; holder rows are not a complete holder census                        |
| Thesis                     | Four HTTP thesis items observed, including structured comment and authorTrade                     |
| Numeric fields             | Wire financial fields were JSON numbers; SDK deliberately normalizes decimal lexemes losslessly   |
| Native HTTP                | Impit0.14.3 succeeded on Node23/macOS; plain host fetch returned430                               |
| Native WS                  | First connection failed; later open/challenge/accepted/subscribed succeeded                       |
| WS data                    | No new events in bounded preflight windows; real delivery/recovery unqualified                    |
| Privy refresh              | Native200 with session_update_action ignore; no new app token, no refresh-token rotation observed |
| True expiry / rotation     | Not live-verified; set/clear/concurrent/persistence tests are synthetic                           |

Prior preflight used small dedicated probes, **not this new package**. Passing this
repository's tests is not a new live service qualification. No new authenticated
requests or transactions are required by `npm run check`.

## Boundaries

- Only stable-path GET resources are in the initial surface.
- Leaderboard window variants and activity cursor behavior include source-derived
  coverage beyond the exact limited preflight sample; do not call all variants
  fully live-qualified.
- Token-feed continuation is intentionally absent.
- Client-side input/resource caps are not official service limits.
- Network IDs are provider-specific; profile-reported wallet fields are not
  cryptographic ownership proofs.
- Refresh response200 alone is insufficient. A real expiry test must demonstrate
  old-token rejection, native renewal, same-account200 and renewed WS subscription
  without taking a replacement token from the webpage.
- Fresh community commits do not guarantee current server compatibility.
- Do not use synthetic activity/history contracts from other repositories as
  evidence that an undocumented endpoint exists.

Before public release: complete an authorized package-level live smoke, actual
expiry/rotation test, WS data/gap observation and intended deployment-platform
qualification. Do not turn CI failures green by weakening contracts to fit guesses.
