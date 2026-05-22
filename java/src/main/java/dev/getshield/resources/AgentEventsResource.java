package dev.getshield.resources;

import com.fasterxml.jackson.databind.JsonNode;
import dev.getshield.ShieldClient;
import dev.getshield.exception.ShieldException;
import dev.getshield.model.AgentEventRequest;
import dev.getshield.model.ShieldEvent;

import java.util.Map;
import java.util.regex.Pattern;

/**
 * Agent events resource — record tamper-evident AI agent actions.
 *
 * <pre>{@code
 * ShieldEvent evt = client.agent().logAction("ses_abc", AgentEventRequest.builder()
 *     .eventType("shield.content.submitted")
 *     .agentId("agt-unique-id")
 *     .agentName("gpt-4o")
 *     .outputHash("9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08")
 *     .build());
 * }</pre>
 */
public class AgentEventsResource {

    private static final Pattern HASH_RE = Pattern.compile("^[0-9a-f]{64}$");

    private final ShieldClient client;

    public AgentEventsResource(ShieldClient client) {
        this.client = client;
    }

    /**
     * Record a tamper-evident AI agent action.
     *
     * @param sessionId session to record the event in
     * @param request   agent event parameters; at least one of agentId or agentName required
     * @return created event
     * @throws ShieldException if validation fails or the API returns an error
     */
    public ShieldEvent logAction(String sessionId, AgentEventRequest request) {
        if ((request.getAgentId() == null || request.getAgentId().isEmpty())
                && (request.getAgentName() == null || request.getAgentName().isEmpty())) {
            throw new ShieldException(0, "agentId or agentName is required for agent evidence events");
        }

        validateHash("promptHash", request.getPromptHash());
        validateHash("inputHash", request.getInputHash());
        validateHash("outputHash", request.getOutputHash());

        Map<String, Object> body = request.toMap();
        JsonNode response = client.request("POST", "/sessions/" + sessionId + "/events/agent", body);
        return client.getObjectMapper().convertValue(response, ShieldEvent.class);
    }

    private static void validateHash(String field, String value) {
        if (value == null || value.isEmpty()) return;
        if (!HASH_RE.matcher(value).matches()) {
            throw new ShieldException(
                0,
                field + " must be a bare 64-character lowercase SHA-256 hex digest (no sha256: prefix)"
            );
        }
    }
}
