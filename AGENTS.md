# Fomo SDK engineering rules

- This is an independent, unofficial, read-only SDK. Do not add execution,
  key export, implicit browser login or account mutations as implementation details.
- Run `npm run check` before committing. It includes format, types, tests and
  installation/typechecking of the exact package tarball in a fresh consumer.
- Keep root HTTP APIs separate from experimental Privy and stream entrypoints.
- Financial numeric literals must be decoded without an intermediate JS Number.
  Preserve missing/null values and provider-specific identifiers.
- Synthetic tests are not live protocol evidence. Update PROTOCOL.md honestly;
  do not claim true expiry/rotation or lossless streaming from mock success.
- Never commit credentials, raw HAR/auth captures, browser profiles or live account
  fixtures. Live probes are opt-in and must not run in untrusted PR jobs.
- Session acquisition/refresh has one owner. Do not introduce nested retry loops
  or assume a persistence callback implements cross-process refresh locking.
- Keep errors credential-safe. Do not copy raw upstream messages into exceptions.
- Package remains private until the user explicitly authorizes publication.
