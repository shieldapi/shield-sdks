from typing import Any, Dict, Optional

from .pii import EventsPii


class Events:
    """Record events within Shield sessions."""

    def __init__(self, client):
        self._client = client
        self.pii = EventsPii(client)

    def create(
        self,
        session_id: str,
        event_type: str,
        actor: str,
        data: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Create a new event in a session.

        Args:
            session_id: The session ID to record the event in.
            event_type: Event type from the Shield Standard Event Taxonomy
                        (e.g. "shield.party.joined").
            actor: Identifier for the actor performing the action.
            data: Optional additional event data.

        Returns:
            Created event object.
        """
        payload: Dict[str, Any] = {
            "event_type": event_type,
            "actor": actor,
        }
        if data is not None:
            payload["data"] = data

        return self._client._request(
            "POST",
            f"/sessions/{session_id}/events",
            json_data=payload,
        )
