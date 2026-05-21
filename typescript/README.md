# Shield JS SDK

Official Shield SDK for JavaScript/TypeScript. Provides a typed client for the Shield tamper-proof audit trail API.

## Installation

```bash
npm install @getshield/js@0.3.0
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

### Verify a Session

```typescript
const result = await shield.verify.session(session.id);

console.log(result.valid);            // true
console.log(result.total_events);     // 12
console.log(result.verified_events);  // 12
console.log(result.broken_at);        // null (or sequence number if tampered)
console.log(result.tsa_status);       // "none" | "pending" | "success" | "failed"
console.log(result.tsa_timestamp);    // null or ISO 8601 timestamp
```

### Export a Session

```typescript
// Export as JSON
const jsonData = await shield.sessions.export(session.id, { format: "json" });

// Export as PDF (returns raw Response for streaming)
const pdfResponse = await shield.sessions.export(session.id, { format: "pdf" });
```

## Express Integration

```typescript
import express from "express";
import { ShieldClient, ShieldEventType } from "@getshield/js";

const app = express();
const shield = new ShieldClient(process.env.SHIELD_API_KEY!);

app.post("/contracts/:id/sign", async (req, res) => {
  await shield.events.create({
    session_id: req.params.id,
    event_type: ShieldEventType.AgreementSigned,
    actor: req.user.email,
    data: { method: "digital" },
  });
  res.json({ signed: true });
});
```

## Error Handling

```typescript
import { ShieldError } from "@getshield/js";

try {
  const event = await shield.events.create({
    session_id: "ses_abc123",
    event_type: ShieldEventType.AgreementSigned,
    actor: "user@example.com",
  });
} catch (e) {
  if (e instanceof ShieldError) {
    switch (e.code) {
      case "plan_limit_exceeded":
        // Handle quota exceeded
        break;
      case "rate_limited":
        // Retry after e.retryAfter seconds
        break;
      default:
        throw e;
    }
  }
}
```

## Event Types

Shield Standard Event Taxonomy v1.0 defines 39 event types across 8 categories:

| Category | Events |
|---|---|
| **Party** | `shield.party.joined`, `shield.party.left`, `shield.party.identity.verified`, `shield.party.identity.failed`, `shield.party.role.assigned` |
| **Session** | `shield.session.created`, `shield.session.opened`, `shield.session.closed`, `shield.session.expired`, `shield.session.archived` |
| **Content** | `shield.content.uploaded`, `shield.content.viewed`, `shield.content.downloaded`, `shield.content.deleted`, `shield.content.hash.verified` |
| **Negotiation** | `shield.negotiation.terms.proposed`, `shield.negotiation.terms.accepted`, `shield.negotiation.terms.rejected`, `shield.negotiation.terms.modified`, `shield.negotiation.terms.expired`, `shield.negotiation.message.sent`, `shield.negotiation.message.read` |
| **Agreement** | `shield.agreement.drafted`, `shield.agreement.reviewed`, `shield.agreement.approved`, `shield.agreement.signed`, `shield.agreement.countersigned`, `shield.agreement.voided`, `shield.agreement.reached` |
| **Access** | `shield.access.granted`, `shield.access.revoked`, `shield.access.attempted`, `shield.access.denied` |
| **Disclosure** | `shield.disclosure.presented`, `shield.disclosure.acknowledged`, `shield.disclosure.declined` |
| **Evidence** | `shield.evidence.exported`, `shield.evidence.verified`, `shield.evidence.tampered_detected` |

All event types are available as `ShieldEventType` enum members for type-safe usage.

## Links

- Website: [https://getshield.dev](https://getshield.dev)
- API Docs: [https://getshield.dev/docs](https://getshield.dev/docs)
- GitHub: [https://github.com/shieldapi/shield-sdks/tree/main/typescript](https://github.com/shieldapi/shield-sdks/tree/main/typescript)
