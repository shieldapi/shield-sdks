from typing import Any, Dict


class Sessions:
    """Manage Shield sessions."""

    def __init__(self, client):
        self._client = client

    def create(self, title: str, metadata: dict = None) -> Dict[str, Any]:
        """Create a new session.

        Args:
            title: Human-readable title for the session.
            metadata: Optional metadata dict to attach to the session.

        Returns:
            Created session object.
        """
        payload: Dict[str, Any] = {"title": title}
        if metadata is not None:
            payload["metadata"] = metadata
        return self._client._request("POST", "/sessions", json_data=payload)

    def retrieve(self, session_id: str) -> Dict[str, Any]:
        """Retrieve a session by ID.

        Args:
            session_id: The session ID.

        Returns:
            Session object.
        """
        return self._client._request("GET", f"/sessions/{session_id}")

    def export(self, session_id: str, format: str = "json"):
        """Export a session in the specified format.

        Args:
            session_id: The session ID.
            format: Export format — "json" or "pdf". Defaults to "json".

        Returns:
            dict if format is "json", bytes for binary formats like "pdf".
        """
        raw = format != "json"
        return self._client._request(
            "GET",
            f"/sessions/{session_id}/export/{format}",
            raw_response=raw,
        )
