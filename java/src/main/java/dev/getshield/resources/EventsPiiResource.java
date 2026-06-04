package dev.getshield.resources;

import com.fasterxml.jackson.databind.JsonNode;
import dev.getshield.ShieldClient;

import java.util.Map;

/**
 * PII management for session events.
 */
public class EventsPiiResource {

    private final ShieldClient client;

    public EventsPiiResource(ShieldClient client) {
        this.client = client;
    }

    /**
     * Store encrypted PII data associated with an event (max 512 KB).
     */
    public JsonNode create(String sessionId, String eventId, String piiData) {
        return client.request(
            "POST",
            "/sessions/" + sessionId + "/events/" + eventId + "/pii",
            Map.of("pii_data", piiData)
        );
    }

    /**
     * Retrieve decrypted PII data for a specific event.
     */
    public JsonNode retrieve(String sessionId, String eventId) {
        return client.request(
            "GET",
            "/sessions/" + sessionId + "/events/" + eventId + "/pii",
            null
        );
    }
}
