# Shield Python SDK

Official Python SDK for [Shield](https://getshield.dev) ??tamper-evident session recording for online business transactions.

## Installation

```bash
pip install shield-python==0.3.1
```

## Quick Start

```python
import shield

client = shield.Client(api_key="sk_live_your_api_key")

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
    event_type="shield.content.uploaded",
    actor="agent@example.com",
    data={"filename": "purchase_agreement.pdf"},
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

## HMAC Authentication

For enhanced security, provide an HMAC secret to sign every request:

```python
client = shield.Client(
    api_key="sk_live_your_api_key",
    hmac_secret="your_hmac_secret",
)
```

When an HMAC secret is configured, the SDK computes a signature for each request:

- `X-Shield-Timestamp` ??Unix timestamp of the request
- `X-Shield-Signature` ??HMAC-SHA256 of `{timestamp}.{METHOD}.{path}.{SHA256(body)}`

The server validates these headers to ensure requests have not been tampered with or replayed.

## Flask Integration

```python
from flask import Flask, request, jsonify
import shield

app = Flask(__name__)
client = shield.Client(api_key="sk_live_your_api_key")

@app.route("/sessions", methods=["POST"])
def create_session():
    data = request.get_json()
    session = client.sessions.create(title=data["title"])

    # Record who created the session
    client.events.create(
        session_id=session["id"],
        event_type="shield.session.created",
        actor=data["user_email"],
    )
    return jsonify(session), 201

@app.route("/sessions/<session_id>/upload", methods=["POST"])
def upload_document(session_id):
    file = request.files["file"]
    # ... save file logic ...

    client.events.create(
        session_id=session_id,
        event_type="shield.content.uploaded",
        actor=request.headers.get("X-User-Email"),
        data={"filename": file.filename},
    )
    return jsonify({"status": "uploaded"}), 200

@app.route("/sessions/<session_id>/sign", methods=["POST"])
def sign_agreement(session_id):
    data = request.get_json()

    client.events.create(
        session_id=session_id,
        event_type="shield.agreement.signed",
        actor=data["signer_email"],
        data={"document": data["document_name"]},
    )
    return jsonify({"status": "signed"}), 200
```

## FastAPI Integration

```python
from fastapi import FastAPI, UploadFile, Header
from pydantic import BaseModel
import shield

app = FastAPI()
client = shield.Client(
    api_key="sk_live_your_api_key",
    hmac_secret="your_hmac_secret",
)

class CreateSessionRequest(BaseModel):
    title: str
    user_email: str

class SignRequest(BaseModel):
    signer_email: str
    document_name: str

@app.post("/sessions")
async def create_session(body: CreateSessionRequest):
    session = client.sessions.create(title=body.title)
    client.events.create(
        session_id=session["id"],
        event_type="shield.session.created",
        actor=body.user_email,
    )
    return session

@app.post("/sessions/{session_id}/upload")
async def upload_document(
    session_id: str,
    file: UploadFile,
    x_user_email: str = Header(...),
):
    # ... save file logic ...

    client.events.create(
        session_id=session_id,
        event_type="shield.content.uploaded",
        actor=x_user_email,
        data={"filename": file.filename},
    )
    return {"status": "uploaded"}

@app.post("/sessions/{session_id}/sign")
async def sign_agreement(session_id: str, body: SignRequest):
    client.events.create(
        session_id=session_id,
        event_type="shield.agreement.signed",
        actor=body.signer_email,
        data={"document": body.document_name},
    )
    return {"status": "signed"}

@app.get("/sessions/{session_id}/verify")
async def verify_session(session_id: str):
    return client.verify.session(session_id)
```

## Event Types Reference

Shield Standard Event Taxonomy v1.0 — 40 event types across 8 categories:

### Party Events
| Event Type | Description |
|---|---|
| `shield.party.joined` | A party joined the session |
| `shield.party.left` | A party left the session |
| `shield.party.identity.verified` | Party identity was verified |
| `shield.party.identity.failed` | Party identity verification failed |
| `shield.party.role.assigned` | A role was assigned to a party |

### Session Events
| Event Type | Description |
|---|---|
| `shield.session.created` | Session was created |
| `shield.session.opened` | Session was opened |
| `shield.session.closed` | Session was closed |
| `shield.session.expired` | Session expired |
| `shield.session.archived` | Session was archived |

### Content Events
| Event Type | Description |
|---|---|
| `shield.content.uploaded` | Content was uploaded |
| `shield.content.viewed` | Content was viewed |
| `shield.content.downloaded` | Content was downloaded |
| `shield.content.deleted` | Content was deleted |
| `shield.content.hash.verified` | Content hash was verified |
| `shield.content.submitted` | Content or analysis was submitted by an AI agent |

### Negotiation Events
| Event Type | Description |
|---|---|
| `shield.negotiation.terms.proposed` | Terms were proposed |
| `shield.negotiation.terms.accepted` | Terms were accepted |
| `shield.negotiation.terms.rejected` | Terms were rejected |
| `shield.negotiation.terms.modified` | Terms were modified |
| `shield.negotiation.terms.expired` | Terms expired |
| `shield.negotiation.message.sent` | Negotiation message sent |
| `shield.negotiation.message.read` | Negotiation message read |

### Agreement Events
| Event Type | Description |
|---|---|
| `shield.agreement.drafted` | Agreement was drafted |
| `shield.agreement.reviewed` | Agreement was reviewed |
| `shield.agreement.approved` | Agreement was approved |
| `shield.agreement.signed` | Agreement was signed |
| `shield.agreement.countersigned` | Agreement was countersigned |
| `shield.agreement.voided` | Agreement was voided |
| `shield.agreement.reached` | Agreement was reached |

### Access Events
| Event Type | Description |
|---|---|
| `shield.access.granted` | Access was granted |
| `shield.access.revoked` | Access was revoked |
| `shield.access.attempted` | Access was attempted |
| `shield.access.denied` | Access was denied |

### Disclosure Events
| Event Type | Description |
|---|---|
| `shield.disclosure.presented` | Disclosure was presented |
| `shield.disclosure.acknowledged` | Disclosure was acknowledged |
| `shield.disclosure.declined` | Disclosure was declined |

### Evidence Events
| Event Type | Description |
|---|---|
| `shield.evidence.exported` | Evidence was exported |
| `shield.evidence.verified` | Evidence was verified |
| `shield.evidence.tampered_detected` | Evidence tampering was detected |

## Versioning & API compatibility

This SDK follows [Semantic Versioning](https://semver.org/).

- **Pre-1.0** (current): minor-version bumps may ship breaking changes. Pin the full version in `requirements.txt`.
- **1.0 and later**: the public API is stable within a major version. Breaking changes require a major-version bump.

The Shield HTTP API is versioned at the URL path (`/api/v1`). This SDK targets `/api/v1` and will not transparently follow a server-side version bump — a new server major version will be delivered as a new SDK major version so callers opt in explicitly.
