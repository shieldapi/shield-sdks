package dev.getshield.exception;

/**
 * Exception thrown when the Shield API returns a non-2xx response.
 */
public class ShieldException extends RuntimeException {

    private final int statusCode;

    public ShieldException(int statusCode, String message) {
        super(message);
        this.statusCode = statusCode;
    }

    public int getStatusCode() {
        return statusCode;
    }

    @Override
    public String toString() {
        return String.format("ShieldException{status=%d, message='%s'}", statusCode, getMessage());
    }
}
