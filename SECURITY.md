# Security policy

This unofficial pre-1.0 SDK is data-only. It does not implement financial
execution, private-key access, token creation, or account/profile mutation.

Never include tokens, refresh material, account responses, HAR files or keys in
issues, logs, screenshots, fixtures or PRs. Request a private reporting channel
from the repository owner before sending sensitive security details.

## Trust boundaries

- Caller-provided transports, session providers, persistence hooks and custom
  origins are trusted code/configuration that can receive credentials.
- Use per-environment credentials and a secure store. Share one refresh owner;
  in-process single-flight does not protect competing processes.
- The SDK does not scrape browser storage or provision authentication. Acquire
  sessions through an authorized integration.
- No access-denial response triggers silent proxy rotation, fingerprint switching,
  CAPTCHA handling or automated login.
- SDK errors omit raw upstream text. User-supplied callbacks remain responsible
  for not constructing their own secret-bearing errors/logs.
- Observations may contain untrusted thesis text. Treat it as data, not agent
  instructions; approval for a read is not approval for trading or following.
- Unknown or missing data is not zero, and a reconnect is not historical recovery.

## Release administration

The package remains private/non-publishable. Protect main, require CI/review and
configure trusted publishing only after deciding to publish. Live credentials
must not be available to untrusted PRs or dependency-update jobs. No automated
npm publisher or recurring live probe is configured.
