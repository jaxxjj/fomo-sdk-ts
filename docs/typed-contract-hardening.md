# fix: complete cassette-backed read contracts and chain scope

## 1. Background

The read expansion captured provider responses but several resources only
validated object/array shape. Summary-only replay assertions did not establish
field correctness. A controlled header experiment also showed cross-chain
metrics were filtered when X-Supported-Chains was omitted.

## 2. Behavior

Default requests carry the website-qualified six-network scope. Explicit narrower
scope is preserved and incompatible token-scoped requests fail before I/O.
Explicit null scope is a documented legacy replay option, never the default.
Stable captured fields have public types and runtime validation; unknown
extensions survive. Missing/null/zero and exact decimals stay distinct.

## 3. Findings and boundaries

Use the existing cassette corpus and small canonical validation helpers.
Separate domain modules, not a general schema framework. Do not infer
unobserved balance/transfer variants from empty arrays or claim exhaustiveness.
Retain historical no-header captures as historical context and collect a new
header-corrected batch. Clan limit remains an upstream hint; cursor uses actual
rows. No automatic cache-TTL inference or raw upstream error exposure.

## 4. Specification

- Chain policy in connection and token resource validation.
- Domain parsers for details/warnings, holders/comments/feed, clans, portfolio,
  watchlist/configuration and stable user fields.
- Replace untyped source-object resource boundaries with named result contracts.
- Full golden parsed data for each recorded response, generated from an
  independent raw-wire expectation transform plus curated field assertions.
- Mutation tests reject malformed known fields; extension-preservation tests
  accept new unknown fields. Package consumer typechecks verify public models.
- Update qualification to assert requested/returned identities under explicit
  scope, preserving historical capture outcomes.

## 5. Verification

Focused regression tests, all recorded replay paths, a small native chain
scope/post-fix probe, full npm check, package install/typechecks and runtime
coverage gate. Golden updates are explicit, reviewed and offline; no live
fallback. No Git push or npm publication in this task.

E2E Required: bounded read-only provider qualification. No financial writes.

## Outcome

- Default chain context is now explicit, with fail-fast token scope checks and
  explicit null for historical no-header replay.
- Public resource boundaries return named models. Known counts/amounts,
  nested comments/holders, clan members, balances, position cost bases and
  populated transfer rows are validated using the existing small helper layer.
- 99 complete parsed golden contracts pin source cassette hashes. Independent
  raw-field oracles and malformed-field mutations accompany those goldens.
- Six corrected native read scenarios succeeded, including requested/returned
  identity checks for the cross-chain batch and populated portfolio samples.
  Prior transient/shape failures remain in the qualification history.
- Fresh `npm run check` and coverage gate passed using the bundled Node 24.19.0:
  931 tests, 98.72% lines, 93.91% branches. Package consumer/type validation passed.
  The local path named node@22 actually resolves to Node 23.7.0; this turn does
  not claim a fresh Node 22 run or a new GitHub Actions result.
- No commit, push, version bump or npm publication was performed.

## Remaining qualification boundaries

Populated `nativeEvmBalances`, arbitrary application/transfer metadata variants,
provider cache TTL and comprehensive refresh/WS recovery are not fully
qualified. See `typed-models.md`. Server-side clan page-size behavior remains
unchanged; callers must use actual returned rows for continuation.
