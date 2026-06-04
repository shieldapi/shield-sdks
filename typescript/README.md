# Shield JS SDK

Official Shield SDK for JavaScript/TypeScript. Provides a typed client for the Shield tamper-proof audit trail API.

## Installation

```bash
npm install @getshield/js@0.4.0
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
  title: "Vehicle Purchase — 2026 Honda Civic",
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

### Record Agent Action Evidence

For browser-automation and tool-call agents, use the typed action helpers. These record what the agent did — Shield does not judge whether the decision was correct.

```typescript
import { createHash } from "crypto";
import { AgentActionEventType, ActionEvidenceParams } from "@getshield/js";

// Hash screenshots/DOM locally — never upload raw images or HTML
const screenshotBeforeHash = createHash("sha256").update(screenshotBytes).digest("hex");
const screenshotAfterHash  = createHash("sha256").update(afterBytes).digest("hex");

// Record a click
await shield.agent.actionClicked(session.id, {
  agent_id: "agt-browser-001",
  principal_user_id: "alice@example.com",
  target_url: "https://app.example.com/checkout",
  element_selector: "#confirm-order",
  element_text: "Confirm Order",
  screenshot_before_hash: screenshotBeforeHash, // bare 64-char hex — do not include the sha256 prefix plus colon
  screenshot_after_hash: screenshotAfterHash,
  risk_level: "medium",
});

// Record a tool call
await shield.agent.actionToolCalled(session.id, {
  agent_id: "agt-001",
  tool_call_id: "call_abc123",
  action_type: "search_web",
  result: "success",
});

// Record a confirmed payment (amount + currency + approval required)
await shield.agent.actionPaymentConfirmed(session.id, {
  agent_id: "agt-001",
  principal_user_id: "alice@example.com",
  amount: 299.99,
  currency: "USD",
  human_approval_event_id: "evt-approval-abc",  // or use authority_scope
});
```

**Action helpers available:**

| Method | Event type |
|---|---|
| `agent.actionNavigated` | `shield.agent.action.navigated` |
| `agent.actionClicked` | `shield.agent.action.clicked` |
| `agent.actionSubmitted` | `shield.agent.action.submitted` |
| `agent.actionToolCalled` | `shield.agent.action.tool_called` |
| `agent.actionPaymentConfirmed` | `shield.agent.action.payment_confirmed` |

All helpers accept `AgentEventParams & ActionEvidenceParams`. The SDK validates that `screenshot_before_hash`, `screenshot_after_hash`, `dom_before_hash`, and `dom_after_hash` are bare 64-character lowercase SHA-256 hex digests. Values beginning with the `sha256` prefix plus colon are rejected client-side before any request is made.

**Payment actions** (`actionPaymentConfirmed`, and `shield.agent.action.payment_initiated` via `logAction`) additionally require `amount`, `currency`, and either `human_approval_event_id` or an `authority_scope` array containing a payment permission string (`"payment"` or `"pay:"`). Validation is enforced server-side; the SDK passes all fields through.

**`AgentActionEventType` enum** — all 10 types:

```typescript
AgentActionEventType.Navigated              // "shield.agent.action.navigated"
AgentActionEventType.Clicked                // "shield.agent.action.clicked"
AgentActionEventType.InputFilled            // "shield.agent.action.input_filled"
AgentActionEventType.Submitted              // "shield.agent.action.submitted"
AgentActionEventType.Confirmed              // "shield.agent.action.confirmed"
AgentActionEventType.PaymentInitiated       // "shield.agent.action.payment_initiated"
AgentActionEventType.PaymentConfirmed       // "shield.agent.action.payment_confirmed"
AgentActionEventType.ToolCalled             // "shield.agent.action.tool_called"
AgentActionEventType.HumanApprovalRequested // "shield.agent.action.human_approval_requested"
AgentActionEventType.HumanApprovalGranted   // "shield.agent.action.human_approval_granted"
```

### Playwright Browser Adapter — Auto-log Browser Actions

For agents that control a real browser via Playwright, `createShieldPlaywrightAdapter`
wraps each action and automatically records the corresponding `shield.agent.action.*`
event. Raw screenshots and DOM are **never sent to Shield** — SHA-256 hashes are
captured locally and only the digest is logged.

```typescript
import { chromium } from "playwright";
import { ShieldClient, createShieldPlaywrightAdapter } from "@getshield/js";

const shield = new ShieldClient(process.env.SHIELD_API_KEY!, {
  hmacSecret: process.env.SHIELD_HMAC_SECRET!,
});

const adapter = createShieldPlaywrightAdapter({
  shield,
  sessionId: session.id,
  agentId:   "agt-browser-001",
  agentName: "playwright-agent",
  principalUserId: "alice@example.com",
  // "pay:checkout" satisfies the payment authority gate
  authorityScope: ["read:checkout", "submit:order", "pay:checkout"],
});

const browser = await chromium.launch();
const page    = await browser.newPage();

// Each call records a tamper-evident evidence event with before/after hashes
await adapter.navigate(page, "https://app.example.com/checkout");
await adapter.fill(page, "#email", "alice@example.com");   // raw value never sent to Shield
await adapter.click(page, "#submit-btn", { riskLevel: "medium" });
await adapter.submit(page, "#checkout-form");

// Payment gate: requires humanApprovalEventId or authority_scope with "payment"/"pay:"
await adapter.confirmPayment(page, "#pay-btn", {
  amount:    29900,   // in cents
  currency:  "USD",
  riskLevel: "high",
  // or: humanApprovalEventId: "evt-approval-xyz"
});

await browser.close();
```

The adapter accepts any object that satisfies the `PageLike` interface — no
`playwright` package import is needed in the adapter itself. Your Playwright version
is not pinned by `@getshield/js`.

**Privacy invariant:** `fill()` logs the selector and before/after page hashes but
**never the typed value**. `confirmPayment()` enforces the payment gate before
clicking — calls without `humanApprovalEventId` or a payment `authority_scope` throw
a `ShieldError` immediately, before any browser interaction.

### MCP Adapter — Auto-log Tool Calls

For agents that call MCP tools, `createShieldMcpAdapter` wraps each tool call and automatically records a `shield.agent.action.tool_called` event. Raw input and output are never sent to Shield — only SHA-256 hashes are logged.

```typescript
import { ShieldClient, createShieldMcpAdapter } from "@getshield/js";

const shield = new ShieldClient(process.env.SHIELD_API_KEY!, {
  hmacSecret: process.env.SHIELD_HMAC_SECRET!,
});

const shieldMcp = createShieldMcpAdapter({
  shield,
  sessionId: session.id,
  agentId: "agt-my-agent",
  agentName: "my-mcp-agent",
  agentProvider: "Anthropic",
  principalUserId: "alice@example.com",
});

// Wrap any tool call — input is hashed locally, never sent to Shield
const fileContent = await shieldMcp.recordToolCall({
  toolName: "read_file",
  toolCallId: "call_abc123",
  input: { path: "/tmp/report.pdf" },
  execute: async (input) => fs.readFile(input.path, "utf8"),
});
```

If the tool throws, Shield logs a `result: "error"` event with a sanitized error message and re-throws the original error. Shield logging failures are non-fatal by default (`throwOnShieldError: false`).

Shield records tamper-evident evidence of tool calls; it does not judge whether the tool result or AI decision was correct.

### Evidence Artifact References

Record tamper-evident references to externally-stored evidence files (screenshots, DOM dumps, I/O traces) by passing `evidence_artifacts` to any action event. Shield seals the `uri` + `sha256` into the hash chain.

**Shield does not store raw bytes.** Upload to your own storage, then pass the resulting URI + SHA-256 hash.

```typescript
import { createHash } from "crypto";

// 1. Capture and hash the screenshot locally
const screenshotBytes: Buffer = await page.screenshot();
const sha256 = createHash("sha256").update(screenshotBytes).digest("hex");

// 2. Upload to your S3 bucket (your responsibility — Shield does not upload for you)
const uri = "s3://my-company-evidence/session-123/screenshot-before.png";
// ... your upload code ...

// 3. Record the tamper-evident reference in Shield
await shield.agent.actionClicked(session.id, {
  actor: "agt-browser-001",
  agent_id: "agt-browser-001",
  element_selector: "#confirm-order",
  evidence_artifacts: [
    {
      artifact_type:    "screenshot_before",  // required
      sha256,                                  // required — bare 64-char lowercase hex
      uri,                                     // optional
      storage_provider: "customer_s3",         // optional
      content_type:     "image/png",           // optional
      size_bytes:       screenshotBytes.length, // optional
    },
  ],
});
```

**Allowed `artifact_type`:** `screenshot_before` | `screenshot_after` | `dom_before` | `dom_after` | `input` | `output` | `trace` | `receipt` | `other`

**Allowed `storage_provider`:** `customer_s3` | `customer_r2` | `customer_gcs` | `customer_azure_blob` | `shield_storage` | `external`

**Allowed `uri` schemes:** `http://` | `https://` | `s3://` | `gs://` | `azure://` | `r2://`

Each artifact's `sha256` is committed to the tamper-evident hash chain. Changing the file at the URI breaks chain verification. Shield proves what was recorded — it does not download or re-verify the file itself.

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
| **Agent Actions** | `shield.agent.action.navigated`, `shield.agent.action.clicked`, `shield.agent.action.input_filled`, `shield.agent.action.submitted`, `shield.agent.action.confirmed`, `shield.agent.action.payment_initiated`, `shield.agent.action.payment_confirmed`, `shield.agent.action.tool_called`, `shield.agent.action.human_approval_requested`, `shield.agent.action.human_approval_granted` |

Standard event types are available as `ShieldEventType` enum members. Agent action types are available as `AgentActionEventType` enum members.

## Versioning & API compatibility

This SDK follows [Semantic Versioning](https://semver.org/).

- **Pre-1.0** (current): minor-version bumps may ship breaking changes. Pin the full version in your lockfile.
- **1.0 and later**: the public API is stable within a major version. Breaking changes require a major-version bump.

The Shield HTTP API is versioned at the URL path (`/api/v1`). This SDK targets `/api/v1` and will not transparently follow a server-side version bump — a new server major version will be delivered as a new SDK major version so callers opt in explicitly.

## Links

- Website: [https://getshield.dev](https://getshield.dev)
- API Docs: [https://getshield.dev/docs](https://getshield.dev/docs)
- GitHub: [https://github.com/shieldapi/shield-sdks/tree/main/typescript](https://github.com/shieldapi/shield-sdks/tree/main/typescript)
