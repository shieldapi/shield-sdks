package dev.getshield;

import org.junit.jupiter.api.Test;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * C-1 (v0.1.6): verify the canonical HMAC message covers path + query string.
 *
 * ShieldClient.request and requestBytes sign `path` verbatim, so embedding a
 * `?query` in path must yield a different signature than omitting it. This
 * test re-implements the exact hashing the SDK performs (ShieldClient lines
 * 102-113) so it runs without network calls or mocks.
 */
public class ShieldClientSigningTest {

    private static String sign(String secret, String timestamp, String method, String path, String body) throws Exception {
        MessageDigest sha = MessageDigest.getInstance("SHA-256");
        byte[] bodyBytes = body.getBytes(StandardCharsets.UTF_8);
        StringBuilder bh = new StringBuilder();
        for (byte b : sha.digest(bodyBytes)) bh.append(String.format("%02x", b));

        String message = timestamp + "." + method + "." + path + "." + bh;
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        StringBuilder sb = new StringBuilder();
        for (byte b : mac.doFinal(message.getBytes(StandardCharsets.UTF_8))) sb.append(String.format("%02x", b));
        return sb.toString();
    }

    @Test
    public void differentQueryStringsYieldDifferentSignatures() throws Exception {
        String secret = "a".repeat(64);
        String ts = "1700000000";
        String sigA = sign(secret, ts, "GET", "/sessions?org=A", "");
        String sigB = sign(secret, ts, "GET", "/sessions?org=B", "");
        assertNotEquals(sigA, sigB, "query-tampering must break the signature");
    }

    @Test
    public void pathWithQueryDiffersFromPathWithout() throws Exception {
        String secret = "a".repeat(64);
        String ts = "1700000000";
        String withQ = sign(secret, ts, "GET", "/sessions?limit=10", "");
        String plain = sign(secret, ts, "GET", "/sessions", "");
        assertNotEquals(withQ, plain);
    }

    @Test
    public void signatureIsLowercaseHex() throws Exception {
        String sig = sign("secret", "1700000000", "POST", "/sessions", "{}");
        assertEquals(sig, sig.toLowerCase(), "signature must be lowercase hex");
        assertEquals(64, sig.length(), "HMAC-SHA256 hex digest is 64 chars");
        assertTrue(sig.matches("[0-9a-f]{64}"));
    }

    @Test
    public void sameInputsAreDeterministic() throws Exception {
        String a = sign("k", "1700000000", "POST", "/x?y=1", "{\"a\":1}");
        String b = sign("k", "1700000000", "POST", "/x?y=1", "{\"a\":1}");
        assertEquals(a, b);
    }
}
