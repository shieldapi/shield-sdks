package dev.getshield.resources;

import com.fasterxml.jackson.databind.JsonNode;
import dev.getshield.ShieldClient;
import dev.getshield.model.ShieldSession;

import java.util.Map;

/**
 * Sessions resource — create, retrieve, export, close, stamp, and PII management.
 */
public class SessionsResource {

    private final ShieldClient client;
    private final SessionsPiiResource pii;

    public SessionsResource(ShieldClient client) {
        this.client = client;
        this.pii = new SessionsPiiResource(client);
    }

    public SessionsPiiResource pii() {
        return pii;
    }

    /**
     * Create a new session.
     */
    public ShieldSession create(String title) {
        JsonNode response = client.request("POST", "/sessions", Map.of("title", title));
        return client.getObjectMapper().convertValue(response, ShieldSession.class);
    }

    /**
     * Retrieve a session by ID.
     */
    public JsonNode retrieve(String sessionId) {
        return client.request("GET", "/sessions/" + sessionId, null);
    }

    /**
     * Close a session permanently. No new events can be appended after closing.
     */
    public ShieldSession close(String sessionId) {
        JsonNode response = client.request("POST", "/sessions/" + sessionId + "/close", null);
        return client.getObjectMapper().convertValue(response, ShieldSession.class);
    }

    /**
     * Request an RFC 3161 timestamp against the session's hash chain tip.
     * Async — returns 202 immediately. Poll {@code verify().session()} and check {@code tsa_status}.
     */
    public JsonNode stamp(String sessionId) {
        return client.request("POST", "/sessions/" + sessionId + "/stamp", null);
    }

    /**
     * Export a session as JSON.
     */
    public JsonNode exportJson(String sessionId) {
        return client.request("GET", "/sessions/" + sessionId + "/export/json", null);
    }

    /**
     * Export a session as PDF bytes.
     */
    public byte[] exportPdf(String sessionId) {
        return client.requestBytes("/sessions/" + sessionId + "/export/pdf");
    }
}
