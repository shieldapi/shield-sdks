package dev.getshield.model;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Request parameters for recording an AI agent evidence event.
 *
 * <p>At least one of {@code agentId} or {@code agentName} must be set.
 * Hash fields ({@code promptHash}, {@code inputHash}, {@code outputHash}) must
 * be bare 64-character lowercase SHA-256 hex digests — no {@code sha256:} prefix.
 *
 * <p>Build via the fluent {@link Builder}:
 * <pre>{@code
 * AgentEventRequest req = AgentEventRequest.builder()
 *     .eventType("shield.content.submitted")
 *     .agentId("agt-unique-id")
 *     .agentName("gpt-4o")
 *     .outputHash("9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08")
 *     .build();
 * }</pre>
 */
public class AgentEventRequest {

    private final String eventType;
    private final String agentId;
    private final String agentName;
    private final String agentProvider;
    private final String principalUserId;
    private final List<String> authorityScope;
    private final String model;
    private final String modelVersion;
    private final String promptHash;
    private final String inputHash;
    private final String outputHash;
    private final String humanApprovalEventId;
    private final String parentEventId;
    private final Map<String, Object> data;

    private AgentEventRequest(Builder b) {
        this.eventType = b.eventType;
        this.agentId = b.agentId;
        this.agentName = b.agentName;
        this.agentProvider = b.agentProvider;
        this.principalUserId = b.principalUserId;
        this.authorityScope = b.authorityScope;
        this.model = b.model;
        this.modelVersion = b.modelVersion;
        this.promptHash = b.promptHash;
        this.inputHash = b.inputHash;
        this.outputHash = b.outputHash;
        this.humanApprovalEventId = b.humanApprovalEventId;
        this.parentEventId = b.parentEventId;
        this.data = b.data;
    }

    public static Builder builder() {
        return new Builder();
    }

    /** Convert to the map shape expected by {@code ShieldClient.request()}. */
    public Map<String, Object> toMap() {
        Map<String, Object> m = new HashMap<>();
        m.put("actor_type", "agent");
        m.put("event_type", eventType);
        putIfPresent(m, "agent_id", agentId);
        putIfPresent(m, "agent_name", agentName);
        putIfPresent(m, "agent_provider", agentProvider);
        putIfPresent(m, "principal_user_id", principalUserId);
        putIfPresent(m, "authority_scope", authorityScope);
        putIfPresent(m, "model", model);
        putIfPresent(m, "model_version", modelVersion);
        putIfPresent(m, "prompt_hash", promptHash);
        putIfPresent(m, "input_hash", inputHash);
        putIfPresent(m, "output_hash", outputHash);
        putIfPresent(m, "human_approval_event_id", humanApprovalEventId);
        putIfPresent(m, "parent_event_id", parentEventId);
        if (data != null) m.put("data", data);
        return m;
    }

    private static void putIfPresent(Map<String, Object> m, String key, String val) {
        if (val != null && !val.isEmpty()) m.put(key, val);
    }

    private static void putIfPresent(Map<String, Object> m, String key, List<String> val) {
        if (val != null && !val.isEmpty()) m.put(key, val);
    }

    public String getEventType() { return eventType; }
    public String getAgentId() { return agentId; }
    public String getAgentName() { return agentName; }
    public String getAgentProvider() { return agentProvider; }
    public String getPrincipalUserId() { return principalUserId; }
    public List<String> getAuthorityScope() { return authorityScope; }
    public String getModel() { return model; }
    public String getModelVersion() { return modelVersion; }
    public String getPromptHash() { return promptHash; }
    public String getInputHash() { return inputHash; }
    public String getOutputHash() { return outputHash; }
    public String getHumanApprovalEventId() { return humanApprovalEventId; }
    public String getParentEventId() { return parentEventId; }
    public Map<String, Object> getData() { return data; }

    public static class Builder {
        private String eventType;
        private String agentId;
        private String agentName;
        private String agentProvider;
        private String principalUserId;
        private List<String> authorityScope;
        private String model;
        private String modelVersion;
        private String promptHash;
        private String inputHash;
        private String outputHash;
        private String humanApprovalEventId;
        private String parentEventId;
        private Map<String, Object> data;

        public Builder eventType(String eventType) { this.eventType = eventType; return this; }
        public Builder agentId(String agentId) { this.agentId = agentId; return this; }
        public Builder agentName(String agentName) { this.agentName = agentName; return this; }
        public Builder agentProvider(String agentProvider) { this.agentProvider = agentProvider; return this; }
        public Builder principalUserId(String principalUserId) { this.principalUserId = principalUserId; return this; }
        public Builder authorityScope(List<String> authorityScope) { this.authorityScope = authorityScope; return this; }
        public Builder model(String model) { this.model = model; return this; }
        public Builder modelVersion(String modelVersion) { this.modelVersion = modelVersion; return this; }
        public Builder promptHash(String promptHash) { this.promptHash = promptHash; return this; }
        public Builder inputHash(String inputHash) { this.inputHash = inputHash; return this; }
        public Builder outputHash(String outputHash) { this.outputHash = outputHash; return this; }
        public Builder humanApprovalEventId(String id) { this.humanApprovalEventId = id; return this; }
        public Builder parentEventId(String id) { this.parentEventId = id; return this; }
        public Builder data(Map<String, Object> data) { this.data = data; return this; }

        public AgentEventRequest build() {
            return new AgentEventRequest(this);
        }
    }
}
