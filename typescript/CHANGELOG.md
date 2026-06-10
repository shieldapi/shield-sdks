# Changelog

All notable changes to `@getshield/js` are documented in this file.
This project follows [Semantic Versioning](https://semver.org/).

## [0.5.0] - 2026-06-10

### Breaking Changes

- **HMAC signature message now includes the nonce** (server AUDIT H-1). The
  canonical message changed from `timestamp.METHOD.requestURI.bodyHash` to
  `timestamp.nonce.METHOD.requestURI.bodyHash`. A captured request can no longer
  be replayed with a fresh nonce inside the timestamp window. **Requires Shield
  API ≥ 0.5.0.** No application code changes needed — signing is internal.

## [0.4.0] - 2026-06-02

### Added

- **Playwright Browser Adapter v1** (`createShieldPlaywrightAdapter`): wraps a real
  Playwright `Page` with Shield evidence logging. Captures SHA-256 hashes of
  screenshots and DOM before/after each action — raw bytes are never sent to Shield.
  Supports `navigate`, `fill`, `click`, `submit`, and `confirmPayment`. Payment gate
  enforced before any browser action: requires `humanApprovalEventId` or an
  `authority_scope` string containing `"payment"` or `"pay:"`.
  - Types exported: `ShieldPlaywrightAdapterConfig`, `NavigateOptions`, `ClickOptions`,
    `FillOptions`, `SubmitOptions`, `ConfirmPaymentOptions`.

- **MCP Adapter v1** (`createShieldMcpAdapter`): wraps MCP tool calls and records
  `shield.agent.action.tool_called` events. SHA-256 hashes of input/output are logged;
  raw content is never forwarded to Shield.

- **Agent Action Evidence v1** (`shield.agent.action.*`): 10 typed action event helpers
  on `ShieldClient.agent` — `actionNavigated`, `actionClicked`, `actionSubmitted`,
  `actionToolCalled`, `actionPaymentInitiated`, `actionPaymentConfirmed`,
  `actionConfirmed`, `actionHumanApprovalRequested`, `actionHumanApprovalGranted`.
  All action hash fields (`screenshot_before_hash`, `screenshot_after_hash`,
  `dom_before_hash`, `dom_after_hash`) are validated as bare 64-character lowercase
  SHA-256 hex digests; values with a `sha256:` prefix are rejected client-side.

- **Evidence Artifact References v1** (`EvidenceArtifact`): attach tamper-evident
  references to externally-stored evidence files (screenshots, DOM snapshots, I/O
  traces). Shield seals the `uri + sha256` into the hash chain — it does not store
  raw bytes. `ArtifactType` and `StorageProvider` literal union types are exported.

- **`AgentActionEventType` enum**: all 10 `shield.agent.action.*` string constants.

### Changed

- `SDK_USER_AGENT` bumped to `shield-js/0.4.0`.

## [0.2.0] - 2026-05-07

### Breaking Changes

- **`hmacSecret` is now required in the `ShieldClient` constructor.** The backend no longer accepts API key-only requests (no HMAC headers). Constructing a client without `hmacSecret` throws a `ShieldError` immediately, so misconfigured clients fail at startup rather than at the first write.

  ```ts
  // Before (would succeed at construction, fail with 401 at runtime)
  const client = new ShieldClient("sk_live_xxx");

  // After (throws ShieldError at construction)
  const client = new ShieldClient("sk_live_xxx", {
    hmacSecret: process.env.SHIELD_HMAC_SECRET,
  });
  ```

## [0.1.6] - 2026-04-17

### Security

- **HMAC signature now covers the full request target, not just the path
  (C-1 fix).** The canonical message is
  `{ts}.{METHOD}.{path + ?query}.{bodyHash}`. Previously the SDK signed only
  the path portion, so a MITM who swapped query parameters on a signed request
  could bypass server-side intent validation. The `path` argument to
  `_rawRequest` is now signed verbatim, including any `?key=value` component,
  matching the backend's switch to `http.Request.URL.RequestURI()` in
  `internal/crypto/hmac.go`. Callers who embed query strings in `path` get
  coverage for free — no API change.
- Signature comparison is now case-insensitive hex on the server (M-1). The
  SDK already emits lowercase hex from `crypto.createHmac().digest("hex")`, so
  no client change was needed beyond compatibility testing.

## [0.1.5] - 2026-04-10

### Breaking Changes

- **`ShieldError` no longer exposes a `code` field.** The Shield API does not
  return a stable error code identifier — only an `error` string and an optional
  `message`. The previous SDK always set `error.code = "unknown_error"` because
  it parsed a non-existent field. The constructor signature changed from
  `(status, code, message)` to `(status, message)`. Code that read `e.code`
  was reading garbage and should switch to branching on `e.status` instead.

  ```ts
  // Before (always logged "unknown_error")
  catch (e) {
    if (e instanceof ShieldError) console.error(e.code);
  }

  // After
  catch (e) {
    if (e instanceof ShieldError) {
      console.error(e.status);   // 400, 401, 404, ...
      console.error(e.message);  // e.g. "title is required"
    }
  }
  ```

### Fixed

- Error responses are now parsed correctly. The SDK reads
  `errorBody.message ?? errorBody.error ?? response.statusText`, matching the
  actual backend envelope `{"error": "...", "message"?: "..."}`. Previously
  `e.message` was always the bare HTTP status text (e.g. `"Bad Request"`)
  because the SDK looked for fields the backend never sends.

## [0.1.4] - 2026-04-09

- Initial public release of the unified SDK surface (`sessions`, `events`, `verify`).
