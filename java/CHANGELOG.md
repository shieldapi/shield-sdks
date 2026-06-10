# Changelog

All notable changes to `dev.getshield:shield-java` are documented in this file.
This project follows [Semantic Versioning](https://semver.org/).

## [0.5.0] - 2026-06-10

### Breaking Changes

- **HMAC signature message now includes the nonce** (server AUDIT H-1). The
  canonical message changed from `timestamp.METHOD.requestURI.bodyHash` to
  `timestamp.nonce.METHOD.requestURI.bodyHash`. A captured request can no longer
  be replayed with a fresh nonce inside the timestamp window. **Requires Shield
  API ≥ 0.5.0.** No application code changes needed — signing is internal.

## [0.4.0] - 2026-06-04

### Added

- `AgentEventsResource` — record tamper-evident AI agent actions via
  `client.agent().logAction(sessionId, request)`. Hash fields (`promptHash`,
  `inputHash`, `outputHash`) are validated client-side as bare 64-character
  lowercase SHA-256 hex digests; values with a `sha256:` prefix are rejected.
- `AgentEventRequest` — fluent builder for agent event parameters. Supports
  `eventType`, `agentId`, `agentName`, `agentProvider`, `principalUserId`,
  `authorityScope`, `model`, `promptHash`, `inputHash`, `outputHash`,
  `humanApprovalEventId`, `parentEventId`, `data`.
- `EventsPiiResource`, `SessionsPiiResource` — PII management endpoints
  (create/retrieve per event; GDPR erase per session).
- `AgentEventsResourceTest`, `ShieldClientSigningTest` — JUnit 5 test coverage.
- `junit-jupiter:5.10.2` (test scope) and `maven-surefire-plugin:3.2.5` added
  to `pom.xml` so `mvn test` runs the test suite.

### Changed

- `pom.xml` version bumped to `0.4.0`. `SDK_USER_AGENT` → `shield-java/0.4.0`.
- `ShieldClient` now requires `hmacSecret` (throws `IllegalArgumentException`
  at construction if absent). `SDK_USER_AGENT` and `X-Shield-Nonce` headers
  added. `AgentEventsResource` wired in as `client.agent()`.
- `ShieldException` constructor simplified to `(int statusCode, String message)` —
  removed the `code` field which was always a hardcoded constant. Callers should
  branch on `e.getStatusCode()` instead of `e.getCode()`.

## [0.2.0] - 2026-05-07

### Breaking Changes

- **`hmacSecret` is now required in the `ShieldClient` constructor.** The backend no longer accepts API key-only requests (no HMAC headers). The single-arg `ShieldClient(apiKey)` and two-arg `ShieldClient(apiKey, baseUrl)` constructors now throw `IllegalArgumentException` because they delegate to the three-arg constructor with `hmacSecret = null`. All callers must migrate to the three-arg form.

  ```java
  // Before (constructed successfully, threw at runtime)
  ShieldClient client = new ShieldClient("sk_live_xxx");

  // After (throws IllegalArgumentException at construction)
  ShieldClient client = new ShieldClient(
      "sk_live_xxx",
      "https://api.getshield.dev/api/v1",
      System.getenv("SHIELD_HMAC_SECRET")
  );
  ```

## [0.1.6] - 2026-04-17

### Security

- **HMAC signature now covers the full request target (path + query string),
  not just the path (C-1 fix).**

## [0.1.5] - 2026-04-10

### Breaking Changes

- **`ShieldException` no longer exposes `getCode()`.** Callers should branch
  on `e.getStatusCode()` instead.

## [0.1.4] - 2026-04-09

- Initial public release of the unified SDK surface (`sessions()`, `events()`, `verify()`).
