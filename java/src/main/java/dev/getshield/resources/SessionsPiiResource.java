package dev.getshield.resources;

import com.fasterxml.jackson.databind.JsonNode;
import dev.getshield.ShieldClient;

/**
 * Session-level PII erasure (GDPR right to erasure).
 */
public class SessionsPiiResource {

    private final ShieldClient client;

    public SessionsPiiResource(ShieldClient client) {
        this.client = client;
    }

    /**
     * Erase all PII records for a session (GDPR right to erasure).
     *
     * <p><b>Irreversible.</b> PII payloads cannot be recovered after deletion.
     * Hash chain integrity is preserved — only the PII payloads are deleted.
     */
    public JsonNode delete(String sessionId) {
        return client.request("DELETE", "/sessions/" + sessionId + "/pii", null);
    }
}
