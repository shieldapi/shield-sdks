# Shield JS SDK

Official Shield SDK for JavaScript/TypeScript. Provides a typed client for the Shield tamper-proof audit trail API.

## Installation

```bash
npm install @getshield/js@0.3.1
```

## Quick Start

### API Key Only

```typescript
import { ShieldClient } from "@getshield/js";

const shield = new ShieldClient("sk_live_your_api_key");
```

### With HMAC Request Signing

```typescript
import { ShieldClient } from "@getshield/js";

const shield = new ShieldClient("sk_live_your_api_key", {
  hmacSecret: "your_hmac_secret",
});
```

## Usage

### Create a Session

```typescript
const session = await shield.sessions.create({
  title: "Vehicle Purchase ??2026 Honda Civic",
});

console.log(session.id); // "ses_abc123..."
```

### Create an Event

```typescript
import { ShieldEventType } from "@getshield/js";

const event = await shield.events.create({
  session_id: session.id,
  event_type: ShieldEventType.PartyJoined,
  actor: "buyer@example.com",
  data: {
    role: "buyer",
    name: "Jane Doe",
  },
});
```

### Record AI Agent Evidence

```typescript
import { createHash } from "crypto";
import { ShieldEventType } from "@getshield/js";

// Hash content locally — never send raw prompts or outputs to Shield
const promptHash = createHash("sha256").update(myPrompt).digest("hex");
const outputHash = createHash("sha256").update(agentOutput).digest("hex");

const event = await shield.agent.logAction(session.id, {
  event_type: ShieldEventType.ContentSubmitted,
  agent_id: "agt-unique-identifier",
  agent_name: "gpt-4o",
  agent_provider: "OpenAI",
  principal_user_id: "alice@example.com",
  prompt_hash: promptHash,   // bare 64-char lowercase hex
  output_hash: outputHash,
});
```

At least one of `agent_id` or `agent_name` is required. Hash fields
(`prompt_hash`, `input_hash`, `output_hash`) must be bare 64-character
lowercase SHA-256 hex digests (no prefix). Providing raw content or an
incorrectly formatted hash throws a `ShieldError`.

### Verify a Session

```typescript
const result = await shield.verify.session(session.id);

console.log(result.valid);           // true
console.log(result.verified_events); // 12
console.log(result.tsa_status);      // "granted"
```

### Export a Session

```typescript
// Export as JSON
const jsonData = await shield.sessions.export(session.id, { format: "json" });

// Export as PDF (returns raw Response for streaming)
const pdfResponse = await shield.sessions.export(session.id, { format: "pdf" });
```

## Event Types

Shield Standard Event Taxonomy v1.0 defines 40 event types across 8 categories:

| Category | Events |
|---|---|
| **Party** | `shield.party.joined`, `shield.party.left`, `shield.party.identity.verified`, `shield.party.identity.failed`, `shield.party.role.assigned` |
| **Session** | `shield.session.created`, `shield.session.opened`, `shield.session.closed`, `shield.session.expired`, `shield.session.archived` |
| **Content** | `shield.content.uploaded`, `shield.content.viewed`, `shield.content.downloaded`, `shield.content.deleted`, `shield.content.hash.verified`, `shield.content.submitted` |
| **Negotiation** | `shield.negotiation.terms.proposed`, `shield.negotiation.terms.accepted`, `shield.negotiation.terms.rejected`, `shield.negotiation.terms.modified`, `shield.negotiation.terms.expired`, `shield.negotiation.message.sent`, `shield.negotiation.message.read` |
| **Agreement** | `shield.agreement.drafted`, `shield.agreement.reviewed`, `shield.agreement.approved`, `shield.agreement.signed`, `shield.agreement.countersigned`, `shield.agreement.voided`, `shield.agreement.reached` |
| **Access** | `shield.access.granted`, `shield.access.revoked`, `shield.access.attempted`, `shield.access.denied` |
| **Disclosure** | `shield.disclosure.presented`, `shield.disclosure.acknowledged`, `shield.disclosure.declined` |
| **Evidence** | `shield.evidence.exported`, `shield.evidence.verified`, `shield.evidence.tampered_detected` |

All event types are available as `ShieldEventType` enum members for type-safe usage.

## Versioning & API compatibility

This SDK follows [Semantic Versioning](https://semver.org/).

- **Pre-1.0** (current): minor-version bumps may ship breaking changes. Pin the full version in your lockfile.
- **1.0 and later**: the public API is stable within a major version. Breaking changes require a major-version bump.

The Shield HTTP API is versioned at the URL path (`/api/v1`). This SDK targets `/api/v1` and will not transparently follow a server-side version bump — a new server major version will be delivered as a new SDK major version so callers opt in explicitly.

## Links

- Website: [https://getshield.dev](https://getshield.dev)
- API Docs: [https://getshield.dev/docs](https://getshield.dev/docs)
- GitHub: [https://github.com/shieldapi/shield-sdks/tree/main/typescript](https://github.com/shieldapi/shield-sdks/tree/main/typescript)
