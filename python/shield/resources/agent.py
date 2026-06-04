import re
from typing import Any, Dict, List, Optional

from ..exceptions import ShieldError

_HASH_RE = re.compile(r"^[0-9a-f]{64}$")
_HASH_FIELDS = ("prompt_hash", "input_hash", "output_hash")

_BARE_HASH_RE = re.compile(r"^[0-9a-f]{64}$")
_ACTION_HASH_FIELDS = (
    "screenshot_before_hash",
    "screenshot_after_hash",
    "dom_before_hash",
    "dom_after_hash",
)

_ARTIFACT_TYPES = frozenset({
    "screenshot_before", "screenshot_after",
    "dom_before", "dom_after",
    "input", "output", "trace", "receipt", "other",
})

_STORAGE_PROVIDERS = frozenset({
    "customer_s3", "customer_r2", "customer_gcs",
    "customer_azure_blob", "shield_storage", "external",
})

_ARTIFACT_URI_SCHEMES = ("http://", "https://", "s3://", "gs://", "azure://", "r2://")


def _validate_evidence_artifacts(artifacts, prefix=""):
    """Validate a list of evidence_artifact dicts.

    Args:
        artifacts: list of dicts, each with at least artifact_type and sha256.
        prefix: error message prefix for context.

    Raises:
        ShieldError: On the first invalid artifact.
    """
    if not artifacts:
        return
    if len(artifacts) > 20:
        raise ShieldError(
            f"{prefix}evidence_artifacts: maximum 20 artifacts per event",
            status_code=0,
        )
    for i, a in enumerate(artifacts):
        tag = f"{prefix}evidence_artifacts[{i}]"
        artifact_type = a.get("artifact_type", "")
        sha256 = a.get("sha256", "")
        uri = a.get("uri")
        storage_provider = a.get("storage_provider")
        size_bytes = a.get("size_bytes")
        content_type = a.get("content_type")
        retention_policy = a.get("retention_policy")
        metadata = a.get("metadata")

        if artifact_type not in _ARTIFACT_TYPES:
            raise ShieldError(
                f"{tag}: artifact_type {artifact_type!r} is not valid; "
                f"allowed: {', '.join(sorted(_ARTIFACT_TYPES))}",
                status_code=0,
            )
        if not _BARE_HASH_RE.match(sha256):
            raise ShieldError(
                f"{tag}: sha256 must be a bare 64-character lowercase SHA-256 hex digest"
                " (no sha256: prefix)",
                status_code=0,
            )
        if uri is not None and uri != "":
            if not any(uri.lower().startswith(s) for s in _ARTIFACT_URI_SCHEMES):
                raise ShieldError(
                    f"{tag}: uri scheme must be http, https, s3, gs, azure, or r2",
                    status_code=0,
                )
        if storage_provider is not None and storage_provider != "" and storage_provider not in _STORAGE_PROVIDERS:
            raise ShieldError(
                f"{tag}: storage_provider {storage_provider!r} is not valid; "
                f"allowed: {', '.join(sorted(_STORAGE_PROVIDERS))}",
                status_code=0,
            )
        if size_bytes is not None and size_bytes < 0:
            raise ShieldError(f"{tag}: size_bytes must be >= 0", status_code=0)
        if content_type is not None and len(content_type) > 128:
            raise ShieldError(f"{tag}: content_type exceeds 128 characters", status_code=0)
        if retention_policy is not None and len(retention_policy) > 128:
            raise ShieldError(f"{tag}: retention_policy exceeds 128 characters", status_code=0)
        if metadata is not None:
            import json as _json
            try:
                b = _json.dumps(metadata)
            except (TypeError, ValueError) as e:
                raise ShieldError(f"{tag}: metadata is not JSON-serializable: {e}", status_code=0)
            if len(b) > 4096:
                raise ShieldError(f"{tag}: metadata exceeds 4096 bytes", status_code=0)


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

    def _call_action(self, session_id: str, event_type: str, **kwargs) -> dict:
        """Internal dispatcher for action* helpers.

        Validates bare-hex action hash fields then posts all kwargs as top-level
        request body fields to POST /sessions/{id}/events/agent.
        Action evidence fields are top-level fields (not nested in data) because
        CreateEventV1Request reads them directly from the JSON body.
        """
        for field in _ACTION_HASH_FIELDS:
            val = kwargs.get(field)
            if val is not None and not _BARE_HASH_RE.match(val):
                raise ShieldError(
                    f"{field} must be a bare 64-character lowercase SHA-256 hex digest"
                    " (no sha256: prefix)",
                    status_code=0,
                )

        _validate_evidence_artifacts(kwargs.get("evidence_artifacts"))

        if not kwargs.get("agent_id") and not kwargs.get("agent_name"):
            raise ShieldError(
                "agent_id or agent_name is required",
                status_code=0,
            )

        payload = {"actor_type": "agent", "event_type": event_type}
        for k, v in kwargs.items():
            if v is not None:
                payload[k] = v

        return self._client._request(
            "POST",
            f"/sessions/{session_id}/events/agent",
            json_data=payload,
        )

    def action_clicked(self, session_id: str, **kwargs) -> dict:
        """Record a browser element click by an AI agent.

        Posts event_type=shield.agent.action.clicked to /sessions/{id}/events/agent.
        Action evidence hash fields (screenshot_before_hash, screenshot_after_hash,
        dom_before_hash, dom_after_hash) must be bare 64-char lowercase SHA-256 hex.
        """
        return self._call_action(session_id, "shield.agent.action.clicked", **kwargs)

    def action_submitted(self, session_id: str, **kwargs) -> dict:
        """Record a form submission by an AI agent.

        Posts event_type=shield.agent.action.submitted.
        """
        return self._call_action(session_id, "shield.agent.action.submitted", **kwargs)

    def action_tool_called(self, session_id: str, **kwargs) -> dict:
        """Record a tool/function call by an AI agent.

        Posts event_type=shield.agent.action.tool_called.
        Pass tool_call_id to link this event to a specific tool invocation.
        """
        return self._call_action(session_id, "shield.agent.action.tool_called", **kwargs)

    def action_payment_confirmed(self, session_id: str, **kwargs) -> dict:
        """Record a confirmed payment by an AI agent.

        Posts event_type=shield.agent.action.payment_confirmed.
        Requires: amount (float), currency (str), and either human_approval_event_id
        or authority_scope containing a payment permission string.
        """
        return self._call_action(session_id, "shield.agent.action.payment_confirmed", **kwargs)
