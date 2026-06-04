# Shield Java SDK

Official Java SDK for [Shield](https://getshield.dev) — tamper-proof audit trails with SHA-256 hash chains.

## Installation

### Maven

```xml
<dependency>
    <groupId>dev.getshield</groupId>
    <artifactId>shield-java</artifactId>
    <version>0.4.0</version>
</dependency>
```

### Gradle

```groovy
implementation 'dev.getshield:shield-java:0.4.0'
```

## Requirements

- Java 11+
- No additional dependencies required beyond Jackson (included)

## Quick Start

```java
import dev.getshield.ShieldClient;
import dev.getshield.model.ShieldSession;
import dev.getshield.model.ShieldEvent;
import dev.getshield.model.EventType;

import java.util.Map;

// Initialize (hmacSecret required)
ShieldClient client = new ShieldClient(
    "sk_live_your_api_key_here",
    "https://api.getshield.dev/api/v1",
    System.getenv("SHIELD_HMAC_SECRET")
);

// Create a session
ShieldSession session = client.sessions().create("Deal with Acme Corp");

// Record an event
ShieldEvent event = client.events().create(
    session.getId(),
    EventType.AGREEMENT_SIGNED,
    "user@company.com",
    Map.of("channel", "email")
);

// Verify the hash chain
var result = client.verify().session(session.getId());
System.out.println("Chain valid: " + result.get("valid").asBoolean());
```

## Recording AI Agent Evidence

```java
import dev.getshield.model.AgentEventRequest;
import java.security.MessageDigest;

// Hash content locally — never send raw prompts or outputs to Shield
String promptHash = sha256Hex(myPrompt);   // bare 64-char lowercase hex
String outputHash = sha256Hex(agentOutput);

ShieldEvent evt = client.agent().logAction(sessionId, AgentEventRequest.builder()
    .eventType("shield.content.submitted")
    .agentId("agt-unique-identifier")
    .agentName("gpt-4o")
    .agentProvider("OpenAI")
    .principalUserId("alice@example.com")
    .promptHash(promptHash)
    .outputHash(outputHash)
    .build());

// Helper: bare 64-char hex SHA-256 digest
static String sha256Hex(String input) throws Exception {
    MessageDigest md = MessageDigest.getInstance("SHA-256");
    byte[] bytes = md.digest(input.getBytes(java.nio.charset.StandardCharsets.UTF_8));
    StringBuilder sb = new StringBuilder();
    for (byte b : bytes) sb.append(String.format("%02x", b));
    return sb.toString();
}
```

At least one of `agentId` or `agentName` is required. Hash fields
(`promptHash`, `inputHash`, `outputHash`) must be bare 64-character lowercase
SHA-256 hex digests (no prefix). Invalid values throw `ShieldException`.

## HMAC Authentication

`hmacSecret` is required. The SDK automatically computes `X-Shield-Signature`,
`X-Shield-Timestamp`, and `X-Shield-Nonce` headers for every request.

```java
ShieldClient client = new ShieldClient(
    "sk_live_your_api_key_here",
    "https://api.getshield.dev/api/v1",
    "hs_your_hmac_secret_here"
);
```

## Session Export

```java
// Export as JSON
var jsonExport = client.sessions().exportJson("session-id");

// Export as PDF
byte[] pdfBytes = client.sessions().exportPdf("session-id");
Files.write(Path.of("audit-trail.pdf"), pdfBytes);
```

## Error Handling

```java
import dev.getshield.exception.ShieldException;

try {
    client.sessions().create("My Session");
} catch (ShieldException e) {
    System.err.println("Status: " + e.getStatusCode());
    System.err.println("Message: " + e.getMessage());
}
```

## Event Types

The SDK includes all 40 events from the Shield Standard Event Taxonomy v1.0.

## Versioning & API compatibility

This SDK follows [Semantic Versioning](https://semver.org/).

- **Pre-1.0** (current): minor-version bumps may ship breaking changes. Pin the full version in your `pom.xml` / `build.gradle`.
- **1.0 and later**: the public API is stable within a major version. Breaking changes require a major-version bump.

## Links

- [Shield Dashboard](https://getshield.dev)
- [API Documentation](https://getshield.dev/docs)
- [GitHub](https://github.com/shieldapi/shield-sdks/tree/main/java)
