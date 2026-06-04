# Changelog

All notable changes to `shield-python` are documented in this file.
This project follows [Semantic Versioning](https://semver.org/).

## [0.4.0] - 2026-06-04

### Added

- **Evidence Artifact References v1** (`evidence_artifacts`): pass a list of
  artifact dicts to any action helper (`action_clicked`, `action_submitted`,
  `action_tool_called`, `action_payment_confirmed`) to record tamper-evident
  references to externally-stored evidence files (screenshots, DOM snapshots,
  I/O traces). Shield seals `uri + sha256` into the hash chain — it does not
  store raw bytes. Validation enforced client-side: `artifact_type` from
  allowlist, bare 64-char lowercase hex `sha256`, `uri` scheme must be
  http/https/s3/gs/azure/r2, `storage_provider` from allowlist,
  `size_bytes >= 0`, `content_type` ≤ 128 chars, `retention_policy` ≤ 128
  chars, `metadata` JSON-serializable and ≤ 4096 bytes.

### Changed

- `SDK_USER_AGENT` bumped to `shield-python/0.4.0`.

## [0.2.0] - 2026-05-07

### Breaking Changes

- **`hmac_secret` is now required in the `Client` constructor.** The backend no longer accepts API key-only requests (no HMAC headers). Passing `hmac_secret=None` (or omitting it) raises a `ShieldError` immediately, so misconfigured clients fail at startup rather than at the first write.

  ```python
  # Before (would succeed at construction, fail with 401 at runtime)
  client = Client(api_key="sk_live_xxx")

  # After (raises ShieldError at construction)
  client = Client(
      api_key="sk_live_xxx",
      hmac_secret=os.environ["SHIELD_HMAC_SECRET"],
  )
  ```

## [0.1.6] - 2026-04-17

### Security

- **HMAC signature now covers the full request target (path + query string),
  not just the path (C-1 fix).** Any caller who passed `params=` to the
  `_request` helper previously got a mismatched signature because the SDK
  signed only `path` while `requests` appended the query to the wire URL.
  The SDK now folds `params` into `path` via `urllib.parse.urlencode(params,
  doseq=True)` before signing, and passes `params=None` to requests so there
  is exactly one canonical query string. Callers who already embedded `?...`
  directly in `path` continue to work; callers using `params=` now produce
  signatures the server will accept. Aligns with the server switch to
  `http.Request.URL.RequestURI()` in `internal/crypto/hmac.go`.
- Signature comparison on the server is now case-insensitive hex (M-1). The
  SDK emits lowercase hex from `hmac.new(...).hexdigest()`; no client change
  was required beyond the signing-target fix above.

## [0.1.5] - 2026-04-10

### Breaking Changes

- **`ShieldError` no longer accepts or exposes a `code` argument.** The Shield
  API does not return a stable error code — only an `error` string and an
  optional `message`. The previous SDK accepted a `code=` keyword argument but
  it was always set to `"api_error"` or `"request_error"` because the parser
  looked for a non-existent field. The constructor signature changed from
  `(message, status_code=None, code=None)` to `(message, status_code=None)`.
  Code that read `e.code` was reading hardcoded garbage and should branch on
  `e.status_code` instead.

### Fixed

- Error responses are now parsed correctly. The SDK reads
  `errorBody.get("message") or errorBody.get("error") or response.text`,
  matching the actual backend envelope `{"error": "...", "message"?: "..."}`.
  Previously `e.message` was the raw HTTP body text because the parser was
  looking for the wrong field key.

## [0.1.4] - 2026-04-09

- Initial public release of the unified SDK surface (`sessions`, `events`, `verify`).
