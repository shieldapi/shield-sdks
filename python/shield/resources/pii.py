from typing import Any, Dict


class EventsPii:
    """PII management for session events."""

    def __init__(self, client):
        self._client = client

    def create(self, session_id: str, event_id: str, pii_data: str) -> Dict[str, Any]:
        """Store encrypted PII data for an event.

        Args:
            session_id: The session ID.
            event_id: The event ID.
            pii_data: Raw PII string to encrypt and store (max 512 KB).

        Returns:
            Dict with ``message`` confirmation.
        """
        return self._client._request(
            "POST",
            f"/sessions/{session_id}/events/{event_id}/pii",
            json_data={"pii_data": pii_data},
        )

    def retrieve(self, session_id: str, event_id: str) -> Dict[str, Any]:
        """Retrieve decrypted PII data for an event.

        Args:
            session_id: The session ID.
            event_id: The event ID.

        Returns:
            Dict with ``pii_data`` field.
        """
        return self._client._request(
            "GET",
            f"/sessions/{session_id}/events/{event_id}/pii",
        )


class SessionsPii:
    """Session-level PII erasure."""

    def __init__(self, client):
        self._client = client

    def delete(self, session_id: str) -> Dict[str, Any]:
        """Erase all PII records for a session (GDPR right to erasure).

        **Irreversible.** PII payloads cannot be recovered after deletion.
        Hash chain integrity is preserved — only the PII payloads are deleted.

        Args:
            session_id: The session ID.

        Returns:
            Dict with ``message``, ``records_erased``, and ``session_id``.
        """
        return self._client._request(
            "DELETE",
            f"/sessions/{session_id}/pii",
        )
