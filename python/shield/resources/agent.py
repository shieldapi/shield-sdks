import re
from typing import Any, Dict, List, Optional

from ..exceptions import ShieldError

_HASH_RE = re.compile(r"^[0-9a-f]{64}$")
_HASH_FIELDS = ("prompt_hash", "input_hash", "output_hash")


class Agent:
    """Record tamper-evident AI agent actions in Shield sessions."""

    def __init__(self, client):
        self._client = client

    def log_action(
        self,
        session_id: str,
        event_type: str,
        *,
        agent_id: Optional[str] = None,
        agent_name: Optional[str] = None,
        agent_provider: Optional[str] = None,
        principal_user_id: Optional[str] = None,
        authority_scope: Optional[List[str]] = None,
        model: Optional[str] = None,
        model_version: Optional[str] = None,
        prompt_hash: Optional[str] = None,
        input_hash: Optional[str] = None,
        output_hash: Optional[str] = None,
        human_approval_event_id: Optional[str] = None,
        parent_event_id: Optional[str] = None,
        data: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Record a tamper-evident AI agent action.

        Args:
            session_id: The session ID to record the event in.
            event_type: Event type from the Shield Standard Event Taxonomy.
            agent_id: Unique identifier for the agent instance.
            agent_name: Human-readable name (e.g. "gpt-4o"). At least one of
                agent_id or agent_name is required.
            agent_provider: Provider of the model (e.g. "OpenAI", "Anthropic").
            principal_user_id: Human user on whose behalf the agent is acting.
            authority_scope: Delegated authority granted to the agent.
            model: Model identifier (e.g. "gpt-4o-2024-05-13").
            model_version: Model version string.
            prompt_hash: Bare 64-char lowercase SHA-256 hex of the prompt.
            input_hash: Bare 64-char lowercase SHA-256 hex of the input.
            output_hash: Bare 64-char lowercase SHA-256 hex of the output.
            human_approval_event_id: Event ID of a human approval for this action.
            parent_event_id: Parent event ID for chaining agent actions.
            data: Optional additional event metadata (max 512 KB).

        Returns:
            Created event object.

        Raises:
            ShieldError: If agent_id and agent_name are both absent, or if a
                hash field contains a value that is not a bare 64-character
                lowercase hex digest.
        """
        if not agent_id and not agent_name:
            raise ShieldError(
                "agent_id or agent_name is required for agent evidence events",
                status_code=0,
            )

        hash_vals = (
            ("prompt_hash", prompt_hash),
            ("input_hash", input_hash),
            ("output_hash", output_hash),
        )
        for field, val in hash_vals:
            if val is not None and not _HASH_RE.match(val):
                raise ShieldError(
                    f"{field} must be a bare 64-character lowercase SHA-256 hex digest"
                    " (no sha256: prefix)",
                    status_code=0,
                )

        payload: Dict[str, Any] = {
            "actor_type": "agent",
            "event_type": event_type,
        }

        optional: Dict[str, Any] = {
            "agent_id": agent_id,
            "agent_name": agent_name,
            "agent_provider": agent_provider,
            "principal_user_id": principal_user_id,
            "authority_scope": authority_scope,
            "model": model,
            "model_version": model_version,
            "prompt_hash": prompt_hash,
            "input_hash": input_hash,
            "output_hash": output_hash,
            "human_approval_event_id": human_approval_event_id,
            "parent_event_id": parent_event_id,
            "data": data,
        }
        payload.update({k: v for k, v in optional.items() if v is not None})

        return self._client._request(
            "POST",
            f"/sessions/{session_id}/events/agent",
            json_data=payload,
        )
