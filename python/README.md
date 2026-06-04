# Shield Python SDK

Official Python SDK for [Shield](https://getshield.dev) — tamper-evident session recording for online business transactions.

## Installation

```bash
pip install shield-python==0.4.0
```

## Quick Start

```python
import shield

client = shield.Client(
    api_key="sk_live_your_api_key",
    hmac_secret="your_hmac_secret",
)

# Create a session
session = client.sessions.create(title="Contract Negotiation with Acme Corp")
session_id = session["id"]

# Record events
client.events.create(
    session_id=session_id,
    event_type="shield.party.joined",
    actor="agent@example.com",
    data={"role": "listing_agent", "name": "Jane Smith"},
)

client.events.create(
    session_id=session_id,
    event_type="shield.agreement.signed",
    actor="buyer@example.com",
    data={"document": "purchase_agreement.pdf"},
)

# Verify session integrity
result = client.verify.session(session_id)
print(result["valid"])  # True

# Export session
pdf_bytes = client.sessions.export(session_id, format="pdf")
with open("audit_trail.pdf", "wb") as f:
    f.write(pdf_bytes)
```

## Recording AI Agent Evidence

```python
import hashlib

# Hash content locally — never send raw prompts or outputs to Shield
prompt_hash = hashlib.sha256(my_prompt.encode()).hexdigest()
output_hash = hashlib.sha256(agent_output.encode()).hexdigest()

event = client.agent.log_action(
    session_id,
    "shield.content.submitted",
    agent_id="agt-unique-identifier",
    agent_name="gpt-4o",
    agent_provider="OpenAI",
    principal_user_id="alice@example.com",
    prompt_hash=prompt_hash,   # bare 64-char lowercase hex
    output_hash=output_hash,
)
```

At least one of `agent_id` or `agent_name` is required. Hash fields
(`prompt_hash`, `input_hash`, `output_hash`) must be bare 64-character
lowercase SHA-256 hex digests (no prefix). Values of incorrect format or
length raise `ShieldError`.

## Recording Agent Action Evidence

For browser-automation and tool-call agents, use the typed action helpers. These record what the agent did — Shield does not judge whether the decision was correct.

```python
import hashlib

# Hash screenshots/DOM locally — never upload raw images or HTML to Shield
screenshot_before_hash = hashlib.sha256(screenshot_bytes).hexdigest()
screenshot_after_hash  = hashlib.sha256(after_bytes).hexdigest()

# Record a click
client.agent.action_clicked(
    session_id,
    agent_id="agt-browser-001",
    principal_user_id="alice@example.com",
    target_url="https://app.example.com/checkout",
    element_selector="#confirm-order",
    element_text="Confirm Order",
    screenshot_before_hash=screenshot_before_hash,
    screenshot_after_hash=screenshot_after_hash,
    risk_level="medium",
)

# Record a tool call
client.agent.action_tool_called(
    session_id,
    agent_id="agt-001",
    tool_call_id="call_abc123",
    action_type="search_web",
    result="success",
)

# Record a confirmed payment (amount + currency + approval required)
client.agent.action_payment_confirmed(
    session_id,
    agent_id="agt-001",
    principal_user_id="alice@example.com",
    amount=299.99,
    currency="USD",
    human_approval_event_id="evt-approval-abc",
)
```

**Action helpers available:**

| Method | Event type |
|---|---|
| `agent.action_clicked` | `shield.agent.action.clicked` |
| `agent.action_submitted` | `shield.agent.action.submitted` |
| `agent.action_tool_called` | `shield.agent.action.tool_called` |
| `agent.action_payment_confirmed` | `shield.agent.action.payment_confirmed` |

### Evidence Artifact References

```python
import hashlib

# 1. Capture and hash the artifact locally
screenshot_bytes = page.screenshot()
sha256 = hashlib.sha256(screenshot_bytes).hexdigest()

# 2. Upload to your storage (Shield does not upload for you)
uri = "s3://my-company-evidence/session-123/screenshot-before.png"

# 3. Record the tamper-evident reference in Shield
client.agent.action_clicked(
    session_id,
    agent_id="agt-browser-001",
    actor="agt-browser-001",
    element_selector="#confirm-order",
    evidence_artifacts=[{
        "artifact_type": "screenshot_before",
        "sha256": sha256,
        "uri": uri,
        "storage_provider": "customer_s3",
        "content_type": "image/png",
        "size_bytes": len(screenshot_bytes),
    }],
)
```

**Allowed `artifact_type`:** `screenshot_before` | `screenshot_after` | `dom_before` | `dom_after` | `input` | `output` | `trace` | `receipt` | `other`

**Allowed `storage_provider`:** `customer_s3` | `customer_r2` | `customer_gcs` | `customer_azure_blob` | `shield_storage` | `external`

**Allowed `uri` schemes:** `http://` | `https://` | `s3://` | `gs://` | `azure://` | `r2://`

## Versioning & API compatibility

This SDK follows [Semantic Versioning](https://semver.org/).

- **Pre-1.0** (current): minor-version bumps may ship breaking changes. Pin the full version in `requirements.txt`.
- **1.0 and later**: the public API is stable within a major version. Breaking changes require a major-version bump.

## Links

- Website: [https://getshield.dev](https://getshield.dev)
- API Docs: [https://getshield.dev/docs](https://getshield.dev/docs)
- GitHub: [https://github.com/shieldapi/shield-sdks/tree/main/python](https://github.com/shieldapi/shield-sdks/tree/main/python)
