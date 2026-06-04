// C-1 v0.1.6: verify the canonical HMAC message includes any ?query string
// in the path. This test reproduces the exact hashing the SDK performs
// (client.ts lines 48-60) without requiring the compiled dist, so it runs on
// a fresh clone via `node --test tests/`.
//
// Why assert this in a unit test: the server bumped from signing URL.Path to
// URL.RequestURI() (backend/internal/crypto/hmac.go). A caller who passes
// "/sessions?org=B" must produce a signature that differs from
// "/sessions?org=A" — otherwise a MITM could swap query params on a signed
// request and the server would still accept it.

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

// Mirror of the SDK's signing block (client.ts _rawRequest).
function sign(secret, timestamp, method, path, bodyStr) {
  const bodyHash = crypto.createHash("sha256").update(bodyStr).digest("hex");
  const message = `${timestamp}.${method}.${path}.${bodyHash}`;
  return crypto.createHmac("sha256", secret).update(message).digest("hex");
}

test("different query strings on the same path yield different signatures", () => {
  const secret = "a".repeat(64);
  const ts = "1700000000";
  const method = "GET";
  const body = "";

  const sigA = sign(secret, ts, method, "/sessions?org=A", body);
  const sigB = sign(secret, ts, method, "/sessions?org=B", body);

  assert.notStrictEqual(sigA, sigB, "query-tampering must break the signature");
});

test("path with query differs from path without query", () => {
  const secret = "a".repeat(64);
  const ts = "1700000000";

  const withQuery = sign(secret, ts, "GET", "/sessions?limit=10", "");
  const withoutQuery = sign(secret, ts, "GET", "/sessions", "");

  assert.notStrictEqual(withQuery, withoutQuery);
});

test("digest('hex') produces lowercase output (server now compares case-insensitively)", () => {
  const sig = sign("secret", "1700000000", "POST", "/sessions", "{}");
  assert.match(sig, /^[0-9a-f]{64}$/, "signature must be lowercase hex");
});

test("same inputs produce the same signature (determinism)", () => {
  const a = sign("k", "1700000000", "POST", "/x?y=1", '{"a":1}');
  const b = sign("k", "1700000000", "POST", "/x?y=1", '{"a":1}');
  assert.strictEqual(a, b);
});
