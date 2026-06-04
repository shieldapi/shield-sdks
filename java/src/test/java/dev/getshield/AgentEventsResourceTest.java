package dev.getshield;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.getshield.exception.ShieldException;
import dev.getshield.model.AgentEventRequest;
import dev.getshield.resources.AgentEventsResource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Tests for AgentEventsResource — validation and request body shape.
 *
 * Uses a CapturingShieldClient that overrides request() to capture
 * the call without making real HTTP requests.
 */
public class AgentEventsResourceTest {

    private static final String VALID_HASH = "a".repeat(64);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private CapturingShieldClient capturingClient;
    private AgentEventsResource resource;

    @BeforeEach
    void setUp() {
        capturingClient = new CapturingShieldClient();
        resource = new AgentEventsResource(capturingClient);
    }

    @Test
    void logAction_postsToCorrectPath() {
        resource.logAction("ses_123", AgentEventRequest.builder()
                .eventType("shield.content.submitted")
                .agentId("agt-1")
                .build());

        assertEquals("/sessions/ses_123/events/agent", capturingClient.lastPath);
        assertEquals("POST", capturingClient.lastMethod);
    }

    @Test
    void logAction_injectsActorTypeAgent() {
        resource.logAction("ses_123", AgentEventRequest.builder()
                .eventType("shield.content.submitted")
                .agentName("gpt-4o")
                .build());

        assertEquals("agent", capturingClient.lastBody.get("actor_type"));
    }

    @Test
    void logAction_throwsWhenNeitherAgentIdNorAgentName() {
        AgentEventRequest req = AgentEventRequest.builder()
                .eventType("shield.content.submitted")
                .build();

        ShieldException ex = assertThrows(ShieldException.class,
                () -> resource.logAction("ses_123", req));
        assertTrue(ex.getMessage().contains("agentId or agentName"));
    }

    @Test
    void logAction_throwsOnPromptHashWithPrefix() {
        AgentEventRequest req = AgentEventRequest.builder()
                .eventType("shield.content.submitted")
                .agentId("agt-1")
                .promptHash("sha256:" + VALID_HASH)
                .build();

        ShieldException ex = assertThrows(ShieldException.class,
                () -> resource.logAction("ses_123", req));
        assertTrue(ex.getMessage().contains("promptHash"));
    }

    @Test
    void logAction_throwsOnShortHash() {
        AgentEventRequest req = AgentEventRequest.builder()
                .eventType("shield.content.submitted")
                .agentId("agt-1")
                .outputHash("abc123")
                .build();

        ShieldException ex = assertThrows(ShieldException.class,
                () -> resource.logAction("ses_123", req));
        assertTrue(ex.getMessage().contains("outputHash"));
    }

    @Test
    void logAction_throwsOnUppercaseHash() {
        AgentEventRequest req = AgentEventRequest.builder()
                .eventType("shield.content.submitted")
                .agentName("gpt-4")
                .inputHash("A".repeat(64))
                .build();

        ShieldException ex = assertThrows(ShieldException.class,
                () -> resource.logAction("ses_123", req));
        assertTrue(ex.getMessage().contains("inputHash"));
    }

    @Test
    void logAction_acceptsValidHashes() {
        resource.logAction("ses_456", AgentEventRequest.builder()
                .eventType("shield.content.submitted")
                .agentId("agt-2")
                .promptHash(VALID_HASH)
                .inputHash(VALID_HASH)
                .outputHash(VALID_HASH)
                .build());

        assertEquals(VALID_HASH, capturingClient.lastBody.get("prompt_hash"));
        assertEquals(VALID_HASH, capturingClient.lastBody.get("output_hash"));
    }

    @Test
    void logAction_passesOptionalFields() {
        resource.logAction("ses_789", AgentEventRequest.builder()
                .eventType("shield.agreement.signed")
                .agentId("agt-3")
                .agentName("claude-3-opus")
                .agentProvider("Anthropic")
                .principalUserId("alice@example.com")
                .model("claude-3-opus-20240229")
                .build());

        assertEquals("Anthropic", capturingClient.lastBody.get("agent_provider"));
        assertEquals("alice@example.com", capturingClient.lastBody.get("principal_user_id"));
        assertEquals("claude-3-opus-20240229", capturingClient.lastBody.get("model"));
    }

    @Test
    void logAction_passesAuthorityScopeAsList() {
        resource.logAction("ses_123", AgentEventRequest.builder()
                .eventType("shield.content.submitted")
                .agentId("agt-1")
                .authorityScope(List.of("read:sessions", "write:events"))
                .build());

        assertEquals(List.of("read:sessions", "write:events"),
                capturingClient.lastBody.get("authority_scope"));
    }

    @Test
    void logAction_omitsNullFields() {
        resource.logAction("ses_123", AgentEventRequest.builder()
                .eventType("shield.content.submitted")
                .agentId("agt-1")
                .build());

        assertFalse(capturingClient.lastBody.containsKey("prompt_hash"));
        assertFalse(capturingClient.lastBody.containsKey("agent_provider"));
    }

    // ── Test helper ──────────────────────────────────────────────────────────

    /** ShieldClient subclass that captures request() calls without HTTP. */
    static class CapturingShieldClient extends ShieldClient {

        String lastMethod;
        String lastPath;
        Map<String, Object> lastBody;

        CapturingShieldClient() {
            // Provide a dummy HMAC secret long enough to satisfy the length check.
            super("sk_test",
                  "https://api.getshield.dev/api/v1",
                  "test-secret-0000000000000000000000000000000000000000000000000000");
        }

        @Override
        public JsonNode request(String method, String path, Map<String, Object> body) {
            this.lastMethod = method;
            this.lastPath = path;
            this.lastBody = body != null ? new HashMap<>(body) : new HashMap<>();
            return MAPPER.createObjectNode();
        }
    }
}
