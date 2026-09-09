# Typed response contracts and evidence

The unreleased source build uses named models and field parsers at every public
resource boundary. Unknown extension fields remain available, with unknown
numeric literals preserved as decimal strings. Models are based on observed
provider payloads; they are not a guarantee that every upstream variant is known.

## Numeric and null semantics

- Money, token amounts, ratios, prices and PnL are exact `DecimalString` values.
- Declared counts, ranks, network IDs and epoch-second bar timestamps are
  validated safe integers. Unsafe/non-integral values reject instead of rounding.
- Opaque IDs, including portfolio snapshot IDs, remain strings.
- Explicit null is retained. Absent optional fields are not defaulted to zero.
- Empty comment text is valid; malformed known fields fail with protocol errors.
- Unknown extensions are retained and not silently cast to a known domain type.

## Model groups

| Module                                    | Contracts and validated fields                                                                                         |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `contracts/users.ts`                      | User identity, addresses, profile metadata, counts, flags, PnL/volume, clan identity, recommendations                  |
| `contracts/market.ts`, `token-details.ts` | Token identity/info, market metrics, metric count windows, OHLCV, trade counts/volumes, concentration, warning records |
| `contracts/comments.ts`, `feed.ts`        | Comments/segments/reactions, thesis pages, aggregate feed records and observed body fields                             |
| `contracts/holders.ts`                    | Holder/user/author-trade values, comments, developer and friend-holder groups                                          |
| `contracts/clans.ts`                      | Clan identity/counts/PnL, members, token holdings and breakdowns                                                       |
| `contracts/portfolio.ts`                  | Nested balances, user-token cost bases, valuation flags and snapshots                                                  |
| `contracts/trades.ts`                     | Trade/position fields, swaps, populated transfer records, trade rows/detail/pages                                      |
| `contracts/configuration.ts`              | Watchlist/allowlist identities and categories; observed application/configuration fields                               |

Public resource methods no longer return bare `ApiResult<SourceObject>` or
`ApiResult<SourceObject[]>`. SourceObject remains the extension base, not the
sole contract of these responses.

## Explicit remaining variant gaps

- `nativeEvmBalances` was empty in the acquired samples. Its nonempty row variants
  remain source extension records; no invented token-balance shape is assigned.
- Application help/media/promotional configuration and transfer metadata can
  contain provider-defined shapes; unmodeled fields remain extensions.
- Optionality describes the SDK's accepted normalized contract, not a claim that
  every absent/null variant was observed live. Synthetic mutation cases cover
  malformed normalized inputs separately.
- A typed provider warning or PnL value is not independent risk/PnL verification.

## Chain scope fix

The default `X-Supported-Chains` value is the six-network website-qualified
scope `1,56,143,4663,8453,1399811149`, exported as `DEFAULT_SUPPORTED_CHAINS`.
It is a provider-network scope, not an RPC-chain mapping.

Explicit narrower `supportedChains` values are preserved. Token-scoped reads
outside that scope reject before transport (`chain_outside_scope`) instead of
silently widening the caller's scope or letting the server silently filter.
`supportedChains: null` explicitly reproduces legacy no-header requests and is
not the recommended live setting.

Current response metadata exposes the sent scope and contract revision.
`meta.observedAt` is receipt/parse time, not a provider price timestamp.
Cache TTL and metric freshness are still not asserted.

## Tests and provenance

`test/fixtures/parsed/` contains complete expected parsed outputs for the
discovered, historical qualification and new typed fixture groups. Each golden
pins the source cassette SHA-256. Normal tests compare full data and pageInfo;
they do not generate expectations at runtime or fall back to live requests.

`typed-fields.test.mjs` independently checks selected raw-wire values using
lossless numeric tokens, safe count conversion, malformed-field mutations and
extension preservation. Full goldens alone would freeze an implementation bug,
so these independent assertions remain necessary.

Refresh deliberately with `npm run test:goldens:update`, then review every
semantic diff. Formatting source cassettes changes their pinned byte hash and
requires the same review even if business data is unchanged.

`docs/typed-qualification.json` records the new bounded native run. The first
attempt's transient network failure and the discovered nested-balance parser
mismatch remain historical evidence. The `verified-*` samples validate the
corrected chain scope, a populated balance/position corpus, and transfer records.
Previously recorded no-header cassettes replay with explicit null scope and
are not mislabeled as post-fix live captures.

Clan leaderboard `limit` is still a server hint; take continuation from actual
returned rows. Type hardening does not change upstream pagination semantics.
