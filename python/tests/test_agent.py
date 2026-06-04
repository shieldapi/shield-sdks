"""Tests for Agent.log_action() — validation and request shape."""

from unittest.mock import patch, MagicMock

import pytest

from shield.client import Client
from shield.exceptions import ShieldError

VALID_HASH = "a" * 64


@pytest.fixture
def client():
    return Client("sk_test", hmac_secret="secret")


@patch("requests.Session.request")
def test_log_action_posts_to_correct_path(mock_req, client):
    mock_req.return_value = MagicMock(
        status_code=200, content=b'{"id":"evt_1"}', json=lambda: {"id": "evt_1"}
    )
    client.agent.log_action("ses_123", "shield.content.submitted", agent_id="agt-1")

    call = mock_req.call_args
    assert "/sessions/ses_123/events/agent" in call.kwargs["url"]
    assert call.kwargs["method"] == "POST"


@patch("requests.Session.request")
def test_log_action_injects_actor_type(mock_req, client):
    import json

    mock_req.return_value = MagicMock(
        status_code=200, content=b'{"id":"evt_1"}', json=lambda: {"id": "evt_1"}
    )
    client.agent.log_action("ses_123", "shield.content.submitted", agent_name="gpt-4o")

    body = json.loads(mock_req.call_args.kwargs["data"])
    assert body["actor_type"] == "agent"


def test_log_action_requires_agent_identity(client):
    with pytest.raises(ShieldError, match="agent_id or agent_name"):
        client.agent.log_action("ses_123", "shield.content.submitted")


def test_log_action_rejects_prompt_hash_with_prefix(client):
    with pytest.raises(ShieldError, match="prompt_hash"):
        client.agent.log_action(
            "ses_123",
            "shield.content.submitted",
            agent_id="agt-1",
            prompt_hash="sha256:" + VALID_HASH,
        )


def test_log_action_rejects_short_hash(client):
    with pytest.raises(ShieldError, match="output_hash"):
        client.agent.log_action(
            "ses_123",
            "shield.content.submitted",
            agent_id="agt-1",
            output_hash="abc123",
        )


def test_log_action_rejects_uppercase_hash(client):
    with pytest.raises(ShieldError, match="input_hash"):
        client.agent.log_action(
            "ses_123",
            "shield.content.submitted",
            agent_name="gpt-4",
            input_hash="A" * 64,
        )


@patch("requests.Session.request")
def test_log_action_accepts_valid_hashes(mock_req, client):
    import json

    mock_req.return_value = MagicMock(
        status_code=200, content=b'{"id":"evt_1"}', json=lambda: {"id": "evt_1"}
    )
    client.agent.log_action(
        "ses_456",
        "shield.content.submitted",
        agent_id="agt-2",
        prompt_hash=VALID_HASH,
        input_hash=VALID_HASH,
        output_hash=VALID_HASH,
    )

    body = json.loads(mock_req.call_args.kwargs["data"])
    assert body["prompt_hash"] == VALID_HASH
    assert body["output_hash"] == VALID_HASH


@patch("requests.Session.request")
def test_log_action_passes_optional_fields(mock_req, client):
    import json

    mock_req.return_value = MagicMock(
        status_code=200, content=b'{"id":"evt_1"}', json=lambda: {"id": "evt_1"}
    )
    client.agent.log_action(
        "ses_789",
        "shield.agreement.signed",
        agent_id="agt-3",
        agent_name="claude-3-opus",
        agent_provider="Anthropic",
        principal_user_id="alice@example.com",
        model="claude-3-opus-20240229",
        data={"contract": "ACME-2026-001"},
    )

    body = json.loads(mock_req.call_args.kwargs["data"])
    assert body["agent_provider"] == "Anthropic"
    assert body["principal_user_id"] == "alice@example.com"
    assert body["model"] == "claude-3-opus-20240229"
    assert body["data"] == {"contract": "ACME-2026-001"}


@patch("requests.Session.request")
def test_log_action_passes_authority_scope_as_list(mock_req, client):
    import json

    mock_req.return_value = MagicMock(
        status_code=200, content=b'{"id":"evt_1"}', json=lambda: {"id": "evt_1"}
    )
    client.agent.log_action(
        "ses_123",
        "shield.content.submitted",
        agent_id="agt-1",
        authority_scope=["read:sessions", "write:events"],
    )

    body = json.loads(mock_req.call_args.kwargs["data"])
    assert body["authority_scope"] == ["read:sessions", "write:events"]


@patch("requests.Session.request")
def test_log_action_omits_none_fields(mock_req, client):
    import json

    mock_req.return_value = MagicMock(
        status_code=200, content=b'{"id":"evt_1"}', json=lambda: {"id": "evt_1"}
    )
    client.agent.log_action("ses_123", "shield.content.submitted", agent_id="agt-1")

    body = json.loads(mock_req.call_args.kwargs["data"])
    assert "prompt_hash" not in body
    assert "agent_provider" not in body
    assert "data" not in body
