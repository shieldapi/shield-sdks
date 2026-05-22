package dev.getshield;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.getshield.exception.ShieldException;
import dev.getshield.resources.AgentEventsResource;
import dev.getshield.resources.EventsResource;
import dev.getshield.resources.SessionsResource;
import dev.getshield.resources.VerifyResource;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.Map;

/**
 * Official Shield SDK client for Java.
 *
 * <pre>{@code
 * ShieldClient client = new ShieldClient("sk_live_xxx");
 * ShieldSession session = client.sessions().create("Deal with Acme Corp");
 * }</pre>
 */
public class ShieldClient {

    private static final String DEFAULT_BASE_URL = "https://api.getshield.dev/api/v1";

    // ARCH-019: kept static so the SDK does not leak JVM version / OS into
    // server logs. Bumped alongside pom.xml version on each release.
    public static final String SDK_USER_AGENT = "shield-java/0.3.1";

    private final String apiKey;
    private final String baseUrl;
    private final String baseUrlPath;
    private final String hmacSecret;
    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;

    private final SessionsResource sessionsResource;
    private final EventsResource eventsResource;
    private final VerifyResource verifyResource;
    private final AgentEventsResource agentEventsResource;

    public ShieldClient(String apiKey) {
        this(apiKey, DEFAULT_BASE_URL, null);
    }

    public ShieldClient(String apiKey, String baseUrl) {
        this(apiKey, baseUrl, null);
    }

    public ShieldClient(String apiKey, String baseUrl, String hmacSecret) {
        if (apiKey == null || apiKey.isEmpty()) {
            throw new IllegalArgumentException("API key is required");
        }
        if (hmacSecret == null || hmacSecret.isEmpty()) {
            throw new IllegalArgumentException(
                "hmacSecret is required. All write operations must be signed. " +
                "See https://docs.getshield.dev/authentication"
            );
        }
        this.apiKey = apiKey;
        String resolvedBase = (baseUrl != null ? baseUrl : DEFAULT_BASE_URL).replaceAll("/+$", "");
        if (!resolvedBase.endsWith("/api/v1")) {
            resolvedBase += "/api/v1";
        }
        this.baseUrl = resolvedBase;
        // Cache path component of baseUrl so HMAC signing includes it.
        // The server validates against RequestURI() (/api/v1/sessions/...),
        // not just the resource path (/sessions/...).
        String resolvedPath;
        try {
            String p = new java.net.URI(this.baseUrl).getPath();
            resolvedPath = (p != null) ? p.replaceAll("/+$", "") : "";
        } catch (Exception e) {
            resolvedPath = "";
        }
        this.baseUrlPath = resolvedPath;
        this.hmacSecret = hmacSecret;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .build();
        this.objectMapper = new ObjectMapper();

        this.sessionsResource = new SessionsResource(this);
        this.eventsResource = new EventsResource(this);
        this.verifyResource = new VerifyResource(this);
        this.agentEventsResource = new AgentEventsResource(this);
    }

    public SessionsResource sessions() {
        return sessionsResource;
    }

    public EventsResource events() {
        return eventsResource;
    }

    public VerifyResource verify() {
        return verifyResource;
    }

    public AgentEventsResource agent() {
        return agentEventsResource;
    }

    /**
     * Perform an HTTP request to the Shield API.
     */
    public JsonNode request(String method, String path, Map<String, Object> body) {
        try {
            String url = baseUrl + path;
            String bodyStr = "";
            if (body != null) {
                bodyStr = objectMapper.writeValueAsString(body);
            }

            HttpRequest.Builder builder = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .timeout(Duration.ofSeconds(30))
                    .header("Content-Type", "application/json")
                    .header("X-Shield-Key", apiKey)
                    .header("User-Agent", SDK_USER_AGENT);

            // HMAC signing
            if (hmacSecret != null && !hmacSecret.isEmpty()) {
                String timestamp = String.valueOf(System.currentTimeMillis() / 1000);
                String nonce = java.util.UUID.randomUUID().toString();
                byte[] bodyBytes = bodyStr.isEmpty() ? new byte[0] : bodyStr.getBytes(StandardCharsets.UTF_8);
                String bodyHash = sha256Hex(bodyBytes);
                // C-1 (v0.1.6): sign `path` verbatim, which is the exact
                // string appended to baseUrl and sent over the wire. If the
                // caller embeds a `?query=string`, it is included here — the
                // server now validates against URL.RequestURI() (path+query),
                // so stripping to URL.getPath() would break query-tampering
                // protection.
                String pathWithQuery = baseUrlPath + path;
                String message = timestamp + "." + method.toUpperCase() + "." + pathWithQuery + "." + bodyHash;
                String signature = hmacSha256Hex(message, hmacSecret);

                builder.header("X-Shield-Timestamp", timestamp);
                builder.header("X-Shield-Signature", signature);
                builder.header("X-Shield-Nonce", nonce);
            }

            HttpRequest.BodyPublisher bodyPublisher = bodyStr.isEmpty()
                    ? HttpRequest.BodyPublishers.noBody()
                    : HttpRequest.BodyPublishers.ofString(bodyStr, StandardCharsets.UTF_8);

            switch (method.toUpperCase()) {
                case "POST":
                    builder.POST(bodyPublisher);
                    break;
                case "GET":
                    builder.GET();
                    break;
                default:
                    builder.method(method.toUpperCase(), bodyPublisher);
                    break;
            }

            HttpResponse<String> response = httpClient.send(
                    builder.build(),
                    HttpResponse.BodyHandlers.ofString()
            );

            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                // Backend returns {"error": "..."} (always) and sometimes
                // {"message": "..."} with extra detail. Prefer message when present.
                String errMsg = "API request failed with status " + response.statusCode();
                try {
                    JsonNode errBody = objectMapper.readTree(response.body());
                    if (errBody.has("message")) {
                        errMsg = errBody.get("message").asText();
                    } else if (errBody.has("error")) {
                        errMsg = errBody.get("error").asText();
                    }
                } catch (Exception ignored) {}
                throw new ShieldException(response.statusCode(), errMsg);
            }

            String responseBody = response.body();
            if (responseBody == null || responseBody.isEmpty()) {
                return objectMapper.createObjectNode();
            }
            return objectMapper.readTree(responseBody);
        } catch (ShieldException e) {
            throw e;
        } catch (Exception e) {
            throw new ShieldException(0, e.getMessage());
        }
    }

    /**
     * Perform a GET request that returns raw bytes (for PDF export).
     */
    public byte[] requestBytes(String path) {
        try {
            String url = baseUrl + path;

            HttpRequest.Builder builder = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .timeout(Duration.ofSeconds(60))
                    .header("X-Shield-Key", apiKey)
                    .header("User-Agent", SDK_USER_AGENT)
                    .GET();

            if (hmacSecret != null && !hmacSecret.isEmpty()) {
                String timestamp = String.valueOf(System.currentTimeMillis() / 1000);
                String nonce = java.util.UUID.randomUUID().toString();
                String bodyHash = sha256Hex(new byte[0]);
                String pathWithQuery = baseUrlPath + path;
                String message = timestamp + ".GET." + pathWithQuery + "." + bodyHash;
                String signature = hmacSha256Hex(message, hmacSecret);
                builder.header("X-Shield-Timestamp", timestamp);
                builder.header("X-Shield-Signature", signature);
                builder.header("X-Shield-Nonce", nonce);
            }

            HttpResponse<byte[]> response = httpClient.send(
                    builder.build(),
                    HttpResponse.BodyHandlers.ofByteArray()
            );

            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new ShieldException(response.statusCode(),
                        "Export request failed with status " + response.statusCode());
            }

            return response.body();
        } catch (ShieldException e) {
            throw e;
        } catch (Exception e) {
            throw new ShieldException(0, e.getMessage());
        }
    }

    public ObjectMapper getObjectMapper() {
        return objectMapper;
    }

    private static String sha256Hex(byte[] input) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(input);
            return bytesToHex(hash);
        } catch (Exception e) {
            throw new RuntimeException("SHA-256 not available", e);
        }
    }

    private static String hmacSha256Hex(String message, String secret) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] hash = mac.doFinal(message.getBytes(StandardCharsets.UTF_8));
            return bytesToHex(hash);
        } catch (Exception e) {
            throw new RuntimeException("HMAC-SHA256 failed", e);
        }
    }

    private static String bytesToHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) {
            sb.append(String.format("%02x", b));
        }
        return sb.toString();
    }
}
