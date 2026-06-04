import * as crypto from "crypto";

// ARCH-020: client-side hash-chain verification for the TypeScript SDK.
//
// Shield computes each event's hash as:
//     SHA256(session_id|sequence_num|event_type|payload_json|prev_hash|ts_iso)
//
// Where:
//   - payload_json is the canonical JSON string of the event payload,
//     produced server-side by Go's default json.Marshal (keys sorted
//     alphabetically on JSONB round-trip, <, >, & HTML-escaped as <
//     etc., no whitespace).
//   - ts_iso is the UTC timestamp truncated to microsecond, formatted as
//     YYYY-MM-DDTHH:mm:ss.SSSSSSZ with six fractional-second digits ALWAYS
//     present.
//
// Reproducing those byte-for-byte in TS is the whole point of this file —
// any divergence from Go's canonicalization produces a false negative for a
// perfectly valid chain, so the helpers here are pedantic on purpose.

export interface ExportEvent {
  session_id: string;
  sequence_num: number;
  event_type: string;
  payload: unknown;
  prev_hash: string;
  event_hash: string;
  created_at: string;
  pii_deleted_at?: string | null;
}

export interface VerifyLocalResult {
  valid: boolean;
  total: number;
  broken_at: number | null;
}

const GENESIS_HASH = "GENESIS";

// canonicalJSONStringify mirrors Go's encoding/json default output:
//   - object keys sorted lexicographically (matches Go map key sort; struct
//     field order is irrelevant because JSONB round-trips sort anyway)
//   - no whitespace
//   - HTML-unsafe runes (< > &) emitted as < > &
//   - U+2028 / U+2029 also escaped (Go's default does not, but they are
//     invalid in HTML contexts and Shield payloads never contain them; we
//     keep parity with stdlib by NOT escaping them here)
export function canonicalJSONStringify(value: unknown): string {
  if (value === null || value === undefined) {
    return "null";
  }
  if (typeof value === "boolean" || typeof value === "number") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") {
    return escapeGoString(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalJSONStringify).join(",") + "]";
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const parts: string[] = [];
    for (const k of keys) {
      parts.push(escapeGoString(k) + ":" + canonicalJSONStringify(obj[k]));
    }
    return "{" + parts.join(",") + "}";
  }
  // Fall back to stdlib for BigInt, etc. — Shield payloads do not use these
  // types, so a mismatch here is loud by design.
  return JSON.stringify(value);
}

// escapeGoString produces the same quoted/escaped form Go's json.Marshal
// emits for a string value. This means honoring its HTML-escape defaults.
function escapeGoString(s: string): string {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    switch (ch) {
      case 0x22: // "
        out += '\\"';
        continue;
      case 0x5c: // \
        out += "\\\\";
        continue;
      case 0x08:
        out += "\\b";
        continue;
      case 0x09:
        out += "\\t";
        continue;
      case 0x0a:
        out += "\\n";
        continue;
      case 0x0c:
        out += "\\f";
        continue;
      case 0x0d:
        out += "\\r";
        continue;
      case 0x3c: // <
      case 0x3e: // >
      case 0x26: // &
        out += "\\u" + ch.toString(16).padStart(4, "0");
        continue;
    }
    if (ch < 0x20) {
      out += "\\u" + ch.toString(16).padStart(4, "0");
      continue;
    }
    out += s.charAt(i);
  }
  return out + '"';
}

// formatTimestampForHash converts an RFC3339 (potentially nano-precision)
// timestamp into Go's hash-input form: microsecond-truncated, six fractional
// digits always, Z suffix.
export function formatTimestampForHash(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`invalid timestamp: ${iso}`);
  }
  // Date resolution is millisecond; to preserve microsecond precision from
  // the server's ISO string, we parse the fractional-second segment manually.
  const match = iso.match(/\.(\d+)/);
  let micros = 0;
  if (match) {
    const frac = (match[1] + "000000").slice(0, 6); // pad/truncate to 6
    micros = parseInt(frac, 10);
  }
  const pad = (n: number, w = 2) => n.toString().padStart(w, "0");
  return (
    d.getUTCFullYear() +
    "-" + pad(d.getUTCMonth() + 1) +
    "-" + pad(d.getUTCDate()) +
    "T" + pad(d.getUTCHours()) +
    ":" + pad(d.getUTCMinutes()) +
    ":" + pad(d.getUTCSeconds()) +
    "." + pad(micros, 6) +
    "Z"
  );
}

// computeEventHash reproduces backend/internal/crypto.ComputeEventHash in TS.
export function computeEventHash(ev: {
  session_id: string;
  sequence_num: number;
  event_type: string;
  payload: unknown;
  prev_hash: string;
  created_at: string;
}): string {
  const payloadJSON = canonicalJSONStringify(ev.payload);
  const ts = formatTimestampForHash(ev.created_at);
  const message = [
    ev.session_id,
    String(ev.sequence_num),
    ev.event_type,
    payloadJSON,
    ev.prev_hash,
    ts,
  ].join("|");
  return crypto.createHash("sha256").update(message).digest("hex");
}

// verifyChain walks events in sequence order, replays every hash, and checks
// prev_hash linkage starting from the genesis anchor. Purged payloads (PII
// retention) are accepted: the link is still enforced via prev_hash, but the
// payload recomputation is skipped because the plaintext no longer exists.
export function verifyChain(events: ExportEvent[]): VerifyLocalResult {
  const sorted = [...events].sort((a, b) => a.sequence_num - b.sequence_num);
  let prev = GENESIS_HASH;
  let expectedSeq = 1;

  for (const ev of sorted) {
    if (ev.sequence_num !== expectedSeq) {
      return { valid: false, total: sorted.length, broken_at: ev.sequence_num };
    }
    if (ev.prev_hash !== prev) {
      return { valid: false, total: sorted.length, broken_at: ev.sequence_num };
    }

    // Purged payloads lose the original bytes; prev_hash linkage alone proves
    // ordering integrity. Mirrors VerifyChainFrom in backend/internal/crypto.
    const purged = ev.payload === null || ev.payload === undefined;
    if (!purged) {
      const recomputed = computeEventHash(ev);
      if (recomputed !== ev.event_hash) {
        return { valid: false, total: sorted.length, broken_at: ev.sequence_num };
      }
    }

    prev = ev.event_hash;
    expectedSeq++;
  }

  return { valid: true, total: sorted.length, broken_at: null };
}
