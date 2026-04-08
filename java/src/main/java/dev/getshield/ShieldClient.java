package dev.getshield;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.getshield.exception.ShieldException;
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

    private final String apiKey;
    private final String baseUrl;
    private final String hmacSecret;
    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;

    private final SessionsResource sessionsResource;
    private final EventsResource eventsResource;
    private final VerifyResource verifyResource;

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
        this.apiKey = apiKey;
        this.baseUrl = baseUrl != null ? baseUrl : DEFAULT_BASE_URL;
        this.hmacSecret = hmacSecret;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .build();
        this.objectMapper = new ObjectMapper();

        this.sessionsResource = new SessionsResource(this);
        this.eventsResource = new EventsResource(this);
        this.verifyResource = new VerifyResource(this);
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
                    .header("X-Shield-Key", apiKey);

            // HMAC signing
            if (hmacSecret != null && !hmacSecret.isEmpty()) {
                String timestamp = String.valueOf(System.currentTimeMillis() / 1000);
                String bodyHash = sha256Hex(bodyStr.isEmpty() ? "" : bodyStr);
                String message = timestamp + "." + method.toUpperCase() + "." + path + "." + bodyHash;
                String signature = hmacSha256Hex(message, hmacSecret);

                builder.header("X-Shield-Timestamp", timestamp);
                builder.header("X-Shield-Signature", signature);
            }

            HttpRequest.BodyPublisher bodyPublisher = bodyStr.isEmpty()
                    ? HttpRequest.BodyPublishers.noBody()
                    : HttpRequest.BodyPublishers.ofString(bodyStr);

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
                String errCode = "unknown_error";
                String errMsg = "API request failed with status " + response.statusCode();
                try {
                    JsonNode errBody = objectMapper.readTree(response.body());
                    if (errBody.has("error")) errCode = errBody.get("error").asText();
                    if (errBody.has("message")) errMsg = errBody.get("message").asText();
                } catch (Exception ignored) {}
                throw new ShieldException(response.statusCode(), errCode, errMsg);
            }

            String responseBody = response.body();
            if (responseBody == null || responseBody.isEmpty()) {
                return objectMapper.createObjectNode();
            }
            return objectMapper.readTree(responseBody);
        } catch (ShieldException e) {
            throw e;
        } catch (Exception e) {
            throw new ShieldException(0, "request_failed", e.getMessage());
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
                    .GET();

            if (hmacSecret != null && !hmacSecret.isEmpty()) {
                String timestamp = String.valueOf(System.currentTimeMillis() / 1000);
                String bodyHash = sha256Hex("");
                String message = timestamp + ".GET." + path + "." + bodyHash;
                String signature = hmacSha256Hex(message, hmacSecret);
                builder.header("X-Shield-Timestamp", timestamp);
                builder.header("X-Shield-Signature", signature);
            }

            HttpResponse<byte[]> response = httpClient.send(
                    builder.build(),
                    HttpResponse.BodyHandlers.ofByteArray()
            );

            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new ShieldException(response.statusCode(), "export_failed",
                        "Export request failed with status " + response.statusCode());
            }

            return response.body();
        } catch (ShieldException e) {
            throw e;
        } catch (Exception e) {
            throw new ShieldException(0, "request_failed", e.getMessage());
        }
    }

    public ObjectMapper getObjectMapper() {
        return objectMapper;
    }

    private static String sha256Hex(String input) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(input.getBytes(StandardCharsets.UTF_8));
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
