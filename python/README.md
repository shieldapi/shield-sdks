# Shield Python SDK

Official Python SDK for [Shield](https://getshield.dev) ??tamper-evident session recording for online business transactions.

## Installation

```bash
pip install shield-python==0.3.0
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
    data={"filename": "purchase_agreement.pdf", "hash": "sha256:abc123..."},
)

client.events.create(
    session_id=session_id,
    event_type="shield.agreement.signed",
    actor="buyer@example.com",
    data={"document": "purchase_agreement.pdf"},
)

# Verify session integrity
result = client.verify.session(session_id)
print(result["valid"])            # True
print(result["total_events"])     # 3
print(result["verified_events"])  # 3
print(result["broken_at"])        # None (or sequence number if tampered)
print(result["tsa_status"])       # "none" | "pending" | "success" | "failed"
print(result["tsa_timestamp"])    # None or ISO 8601 timestamp

# Export session
pdf_bytes = client.sessions.export(session_id, format="pdf")
with open("audit_trail.pdf", "wb") as f:
    f.write(pdf_bytes)
```

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

## Error Handling

```python
from shield.exceptions import ShieldError

try:
    event = client.events.create(
        session_id=session_id,
        event_type="shield.agreement.signed",
        actor="user@company.com",
    )
except ShieldError as e:
    if e.code == "plan_limit_exceeded":
        # notify admin to upgrade
        pass
    elif e.code == "rate_limited":
        import time
        time.sleep(e.retry_after)
    else:
        raise
```

## Event Types Reference

Shield Standard Event Taxonomy v1.0 — 39 event types across 8 categories:

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
