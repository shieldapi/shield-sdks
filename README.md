# Shield SDKs

Official client libraries for the [Shield](https://getshield.dev) tamper-proof evidence API — SHA-256 hash chains, RFC 3161 timestamps, and FRE 902(13) compliant audit trails.

## Available SDKs

| Language | Package | Install | Status |
|----------|---------|---------|--------|
| JavaScript / TypeScript | [@getshield/js](https://npmjs.com/package/@getshield/js) | `npm install @getshield/js` | [![npm](https://img.shields.io/npm/v/@getshield/js)](https://npmjs.com/package/@getshield/js) |
| Python | [shield-python](https://pypi.org/project/shield-python/) | `pip install shield-python` | [![PyPI](https://img.shields.io/pypi/v/shield-python)](https://pypi.org/project/shield-python/) |
| Java | [shield-java](https://github.com/shieldapi/shield-sdks/tree/main/java) | `implementation 'dev.getshield:shield-java:0.3.0'` | [![Maven](https://img.shields.io/maven-central/v/dev.getshield/shield-java)](https://search.maven.org/artifact/dev.getshield/shield-java) |

## Quick Start

```typescript
import { ShieldClient, ShieldEventType } from "@getshield/js";

const shield = new ShieldClient("sk_live_your_api_key");

const session = await shield.sessions.create({ title: "Vehicle Purchase — 2026 Honda Civic" });

await shield.events.create({
  session_id: session.id,
  event_type: ShieldEventType.AgreementSigned,
  actor: "buyer@example.com",
  data: { method: "digital" },
});

const result = await shield.verify.session(session.id);
console.log(result.valid); // true
```

## SDK Documentation

| SDK | README |
|-----|--------|
| TypeScript | [typescript/README.md](./typescript/README.md) |
| Python | [python/README.md](./python/README.md) |
| Java | [java/README.md](./java/README.md) |

## Full Documentation

API reference, event taxonomy, and integration guides: **https://getshield.dev/docs**
