# Shield Java SDK

Official Java SDK for [Shield](https://getshield.dev) — tamper-proof audit trails with SHA-256 hash chains.

## Installation

### Maven

```xml
<dependency>
    <groupId>dev.getshield</groupId>
    <artifactId>shield-java</artifactId>
    <version>0.2.0</version>
</dependency>
```

### Gradle

```groovy
implementation 'dev.getshield:shield-java:0.2.0'
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

// Initialize
ShieldClient client = new ShieldClient("sk_live_your_api_key_here");

// Create a session
ShieldSession session = client.sessions().create("Deal with Acme Corp");
System.out.println("Session created: " + session.getId());

// Record an event
ShieldEvent event = client.events().create(
    session.getId(),
    EventType.AGREEMENT_SIGNED,
    "user@company.com",
    Map.of("channel", "email")
);
System.out.println("Event recorded: " + event.getHash());

// Verify the hash chain
var result = client.verify().session(session.getId());
System.out.println("Chain valid: " + result.get("valid").asBoolean());
System.out.println("Total events: " + result.get("total_events").asInt());
System.out.println("Verified events: " + result.get("verified_events").asInt());
System.out.println("Broken at: " + result.get("broken_at"));            // null or sequence number
System.out.println("TSA status: " + result.get("tsa_status").asText()); // "none" | "pending" | "success" | "failed"
System.out.println("TSA timestamp: " + result.get("tsa_timestamp"));    // null or ISO 8601 timestamp
```

## HMAC Authentication

For enhanced security, provide your HMAC secret:

```java
ShieldClient client = new ShieldClient(
    "sk_live_your_api_key_here",
    "https://api.getshield.dev/api/v1",
    "hs_your_hmac_secret_here"
);
```

The SDK automatically computes `X-Shield-Signature` and `X-Shield-Timestamp` headers for every request.

Signature algorithm:
```
message = timestamp + "." + METHOD + "." + path + "." + hex(SHA256(body))
X-Shield-Signature = hex(HMAC-SHA256(message, hmac_secret))
```

## Session Export

```java
// Export as JSON
var jsonExport = client.sessions().exportJson("session-id");

// Export as PDF
byte[] pdfBytes = client.sessions().exportPdf("session-id");
Files.write(Path.of("audit-trail.pdf"), pdfBytes);
```

## Spring Boot Integration

```java
import dev.getshield.ShieldClient;
import dev.getshield.model.EventType;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class ShieldConfig {
    @Bean
    public ShieldClient shieldClient(@Value("${shield.api-key}") String apiKey) {
        return new ShieldClient(apiKey);
    }
}
```

```java
import dev.getshield.ShieldClient;
import dev.getshield.model.EventType;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/contracts")
public class ContractController {

    private final ShieldClient shield;

    public ContractController(ShieldClient shield) {
        this.shield = shield;
    }

    @PostMapping("/{id}/sign")
    public Map<String, Object> signContract(
            @PathVariable String id,
            @RequestAttribute String userEmail) {

        // Record the signing event
        var event = shield.events().create(
            id,
            EventType.AGREEMENT_SIGNED,
            userEmail,
            Map.of("contract_id", id, "method", "digital")
        );

        return Map.of(
            "signed", true,
            "audit_hash", event.getHash(),
            "sequence", event.getSequence()
        );
    }
}
```

## Event Types

The SDK includes all 39 events from the Shield Standard Event Taxonomy v1.0:

| Category | Events |
|----------|--------|
| Party | `PARTY_JOINED`, `PARTY_LEFT`, `PARTY_IDENTITY_VERIFIED`, `PARTY_IDENTITY_FAILED`, `PARTY_ROLE_ASSIGNED` |
| Session | `SESSION_CREATED`, `SESSION_OPENED`, `SESSION_CLOSED`, `SESSION_EXPIRED`, `SESSION_ARCHIVED` |
| Content | `CONTENT_UPLOADED`, `CONTENT_VIEWED`, `CONTENT_DOWNLOADED`, `CONTENT_DELETED`, `CONTENT_HASH_VERIFIED` |
| Negotiation | `NEGOTIATION_TERMS_PROPOSED`, `NEGOTIATION_TERMS_ACCEPTED`, `NEGOTIATION_TERMS_REJECTED`, `NEGOTIATION_TERMS_MODIFIED`, `NEGOTIATION_TERMS_EXPIRED`, `NEGOTIATION_MESSAGE_SENT`, `NEGOTIATION_MESSAGE_READ` |
| Agreement | `AGREEMENT_DRAFTED`, `AGREEMENT_REVIEWED`, `AGREEMENT_APPROVED`, `AGREEMENT_SIGNED`, `AGREEMENT_COUNTERSIGNED`, `AGREEMENT_VOIDED`, `AGREEMENT_REACHED` |
| Access | `ACCESS_GRANTED`, `ACCESS_REVOKED`, `ACCESS_ATTEMPTED`, `ACCESS_DENIED` |
| Disclosure | `DISCLOSURE_PRESENTED`, `DISCLOSURE_ACKNOWLEDGED`, `DISCLOSURE_DECLINED` |
| Evidence | `EVIDENCE_EXPORTED`, `EVIDENCE_VERIFIED`, `EVIDENCE_TAMPERED_DETECTED` |

## Error Handling

```java
import dev.getshield.exception.ShieldException;

try {
    client.sessions().create("My Session");
} catch (ShieldException e) {
    System.err.println("Status: " + e.getStatusCode());
    System.err.println("Code: " + e.getCode());
    System.err.println("Message: " + e.getMessage());
}
```

## Links

- [Shield Dashboard](https://getshield.dev)
- [API Documentation](https://getshield.dev/docs)
- [GitHub](https://github.com/shieldapi/shield-sdks/tree/main/java)
