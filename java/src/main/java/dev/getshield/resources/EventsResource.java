package dev.getshield.resources;

import com.fasterxml.jackson.databind.JsonNode;
import dev.getshield.ShieldClient;
import dev.getshield.model.EventType;
import dev.getshield.model.ShieldEvent;

import java.util.HashMap;
import java.util.Map;

/**
 * Events resource — record events to a session's hash chain.
 */
public class EventsResource {

    private final ShieldClient client;
    private final EventsPiiResource pii;

    public EventsResource(ShieldClient client) {
        this.client = client;
        this.pii = new EventsPiiResource(client);
    }

    public EventsPiiResource pii() {
        return pii;
    }

    /**
     * Append an event to a session.
     */
    public ShieldEvent create(String sessionId, EventType eventType, String actor) {
        return create(sessionId, eventType, actor, null);
    }

    /**
     * Append an event with additional data to a session.
     */
    public ShieldEvent create(String sessionId, EventType eventType, String actor, Map<String, Object> data) {
        return create(sessionId, eventType.getValue(), actor, data);
    }

    /**
     * Append an event using a raw event type string.
     */
    public ShieldEvent create(String sessionId, String eventType, String actor, Map<String, Object> data) {
        Map<String, Object> body = new HashMap<>();
        body.put("event_type", eventType);
        body.put("actor", actor);
        if (data != null) {
            body.put("data", data);
        }

        JsonNode response = client.request("POST", "/sessions/" + sessionId + "/events", body);
        return client.getObjectMapper().convertValue(response, ShieldEvent.class);
    }
}
