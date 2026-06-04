"""C-1 (v0.1.6): verify the Python SDK's canonical HMAC message covers the
full request target (path + query string), not just the path.

This test asserts the invariant directly from the Client internals: given a
path and a params dict, the SDK must produce a signature over the SAME string
that the server will see via http.Request.URL.RequestURI(). Different query
strings -> different signatures.

Run with: pytest tests/
"""

import hashlib
import hmac
from unittest.mock import patch, MagicMock

import pytest

from shield.client import Client


def _extract_signed_message(mock_request) -> str:
    """Reconstruct the message the SDK signed, from the mock call args.

    We capture the outgoing URL (which includes the final query string the
    wire sees) and the X-Shield-Timestamp header, then recompute what the
    canonical message would be if the SDK signed the URL's path+query.
    Comparing that to the signature the SDK actually sent proves coverage.
    """
    call = mock_request.call_args
    return call.kwargs["headers"]["X-Shield-Signature"], call.kwargs["url"], call.kwargs["headers"]


def _expected_signature(secret: str, timestamp: str, method: str, path_with_query: str, body: bytes) -> str:
    body_hash = hashlib.sha256(body).hexdigest()
    message = f"{timestamp}.{method}.{path_with_query}.{body_hash}"
    return hmac.new(secret.encode(), message.encode(), hashlib.sha256).hexdigest()


@patch("requests.Session.request")
def test_params_are_included_in_signature(mock_req):
    mock_req.return_value = MagicMock(status_code=200, content=b"{}", json=lambda: {})

    secret = "a" * 64
    client = Client("sk_test", base_url="https://api.getshield.dev/api/v1", hmac_secret=secret)

    client._request("GET", "/sessions", params={"org": "A"})

    sig, url, headers = _extract_signed_message(mock_req)
    ts = headers["X-Shield-Timestamp"]

    # Wire URL must include the query string exactly once.
    assert url == "https://api.getshield.dev/api/v1/sessions?org=A"
    # Signature must cover path+query, not just path.
    assert sig == _expected_signature(secret, ts, "GET", "/api/v1/sessions?org=A", b"")
    # And must NOT match signing of path alone (the pre-0.1.6 behavior).
    assert sig != _expected_signature(secret, ts, "GET", "/api/v1/sessions", b"")


@patch("requests.Session.request")
def test_different_params_produce_different_signatures(mock_req):
    mock_req.return_value = MagicMock(status_code=200, content=b"{}", json=lambda: {})
    secret = "a" * 64
    client = Client("sk_test", hmac_secret=secret)

    client._request("GET", "/sessions", params={"org": "A"})
    sig_a, _, _ = _extract_signed_message(mock_req)

    client._request("GET", "/sessions", params={"org": "B"})
    sig_b, _, _ = _extract_signed_message(mock_req)

    assert sig_a != sig_b, "query tampering must invalidate the signature"


@patch("requests.Session.request")
def test_no_params_preserves_legacy_signature(mock_req):
    """Backwards compat: requests without params sign just `path`, matching
    the pre-0.1.6 SDK behavior. The C-1 fix only activates when params are
    present, so existing callers see no signature change."""
    mock_req.return_value = MagicMock(status_code=200, content=b"{}", json=lambda: {})

    secret = "a" * 64
    client = Client("sk_test", hmac_secret=secret)

    client._request("POST", "/sessions", json_data={"title": "x"})
    sig, _, headers = _extract_signed_message(mock_req)
    ts = headers["X-Shield-Timestamp"]

    body = b'{"title":"x"}'
    assert sig == _expected_signature(secret, ts, "POST", "/api/v1/sessions", body)


@patch("requests.Session.request")
def test_signature_is_lowercase_hex(mock_req):
    mock_req.return_value = MagicMock(status_code=200, content=b"{}", json=lambda: {})
    client = Client("sk_test", hmac_secret="secret")
    client._request("GET", "/sessions")
    sig, _, _ = _extract_signed_message(mock_req)
    assert sig == sig.lower()
    assert len(sig) == 64
    assert all(c in "0123456789abcdef" for c in sig)
