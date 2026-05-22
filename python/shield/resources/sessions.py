import json
from typing import Any, Dict, List, Union

from .pii import SessionsPii


class Sessions:
    """Manage Shield sessions."""

    def __init__(self, client):
        self._client = client
        self.pii = SessionsPii(client)

    def create(self, title: str) -> Dict[str, Any]:
        """Create a new session.

        Args:
            title: Human-readable title for the session.

        Returns:
            Created session object.
        """
        return self._client._request("POST", "/sessions", json_data={"title": title})

    def retrieve(self, session_id: str) -> Dict[str, Any]:
        """Retrieve a session by ID.

        Args:
            session_id: The session ID.

        Returns:
            Session object.
        """
        return self._client._request("GET", f"/sessions/{session_id}")

    def close(self, session_id: str) -> Dict[str, Any]:
        """Close a session permanently. No new events can be appended after closing.

        Args:
            session_id: The session ID.

        Returns:
            Dict with ``id``, ``status``, and ``closed_at``.
        """
        return self._client._request("POST", f"/sessions/{session_id}/close")

    def stamp(self, session_id: str) -> Dict[str, Any]:
        """Request an RFC 3161 timestamp against the session's hash chain tip.

        Async — returns 202 immediately. Poll ``verify.session()`` and check
        ``tsa_status`` for the result.

        Args:
            session_id: The session ID.

        Returns:
            Dict with ``session_id``, ``tsa_status``, and ``message``.
        """
        return self._client._request("POST", f"/sessions/{session_id}/stamp")

    def export(self, session_id: str, format: str = "json") -> Union[List[Dict[str, Any]], bytes]:
        """Export a session in the specified format.

        Args:
            session_id: The session ID.
            format: Export format — "json" or "pdf". Defaults to "json".

        Returns:
            List of parsed NDJSON record dicts for "json" format,
            or raw bytes for "pdf".
        """
        if format == "pdf":
            return self._client._request(
                "GET",
                f"/sessions/{session_id}/export/pdf",
                raw_response=True,
            )
        # The API streams NDJSON (one JSON object per line). response.json()
        # would fail on multi-line NDJSON, so we fetch raw bytes and parse
        # each line independently.
        raw: bytes = self._client._request(
            "GET",
            f"/sessions/{session_id}/export/json",
            raw_response=True,
        )
        records = []
        for line in raw.decode("utf-8").splitlines():
            line = line.strip()
            if line:
                records.append(json.loads(line))
        return records
