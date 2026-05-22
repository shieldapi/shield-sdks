import hashlib
import hmac as hmac_mod
import json
import time
from typing import Any, Dict, Optional
from urllib.parse import urlencode, urlparse

import requests

from .exceptions import ShieldError
from .resources.sessions import Sessions
from .resources.events import Events
from .resources.verify import Verify
from .resources.agent import Agent

# ARCH-019: kept static to avoid leaking Python version / OS into server logs.
# Bumped alongside setup.py version on each release.
SDK_USER_AGENT = "shield-python/0.3.1"


class Client:
    """Official Shield Python SDK client.

    Args:
        api_key: Your Shield API key.
        base_url: Base URL for the Shield API. Defaults to https://api.getshield.dev/api/v1.
        hmac_secret: Optional HMAC secret for request signing.
        timeout: Request timeout in seconds. Defaults to 30.
    """

    def __init__(
        self,
        api_key: str,
        base_url: str = "https://api.getshield.dev/api/v1",
        hmac_secret: Optional[str] = None,
        timeout: int = 30,
    ):
        if not hmac_secret:
            raise ShieldError(
                message=(
                    "hmac_secret is required. All write operations must be signed. "
                    "See https://docs.getshield.dev/authentication"
                ),
                status_code=0,
            )
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        if not self.base_url.endswith("/api/v1"):
            self.base_url += "/api/v1"
        # Cache path component of base_url so HMAC signing includes it.
        # The server validates against RequestURI() (/api/v1/sessions/...),
        # not just the resource path (/sessions/...).
        self._base_url_path = urlparse(self.base_url).path.rstrip("/")
        self.hmac_secret = hmac_secret
        self.timeout = timeout
        self._session = requests.Session()

        # Resource instances
        self.sessions = Sessions(self)
        self.events = Events(self)
        self.verify = Verify(self)
        self.agent = Agent(self)

    def _request(
        self,
        method: str,
        path: str,
        json_data: Optional[Dict[str, Any]] = None,
        params: Optional[Dict[str, Any]] = None,
        raw_response: bool = False,
    ) -> Any:
        """Make an authenticated request to the Shield API.

        Args:
            method: HTTP method (GET, POST, PUT, DELETE).
            path: API path (e.g. /sessions).
            json_data: JSON body for POST/PUT requests.
            params: Query parameters.
            raw_response: If True, return raw response content (bytes).

        Returns:
            Parsed JSON response as dict, or bytes if raw_response is True.

        Raises:
            ShieldError: On non-2xx responses or request failures.
        """
        method = method.upper()

        # C-1 (v0.1.6): fold query params into `path` BEFORE signing so the
        # canonical message matches what the server validates against
        # http.Request.URL.RequestURI(). Previously `params` was passed to
        # requests.request() separately — requests would append them to the
        # wire URL, but the SDK signed only the bare path, guaranteeing a
        # signature mismatch on any request with query params. We pre-encode
        # here and pass params=None to requests so there is exactly one
        # canonical query string, controlled by this SDK, for both signing
        # and transmission. doseq=True matches requests' own encoding for
        # list-valued params (?tag=a&tag=b).
        if params:
            path_with_query = f"{path}?{urlencode(params, doseq=True)}"
        else:
            path_with_query = path

        url = f"{self.base_url}{path_with_query}"

        headers = {
            "X-Shield-Key": self.api_key,
            "Content-Type": "application/json",
            "User-Agent": SDK_USER_AGENT,
        }

        # Serialize body
        body = b""
        if json_data is not None:
            body = json.dumps(json_data, separators=(",", ":")).encode("utf-8")

        # HMAC signing
        if self.hmac_secret:
            import uuid
            timestamp = str(int(time.time()))
            nonce = str(uuid.uuid4())
            body_hash = hashlib.sha256(body).hexdigest()
            message = f"{timestamp}.{method}.{self._base_url_path}{path_with_query}.{body_hash}"
            signature = hmac_mod.new(
                self.hmac_secret.encode("utf-8"),
                message.encode("utf-8"),
                hashlib.sha256,
            ).hexdigest()
            headers["X-Shield-Signature"] = signature
            headers["X-Shield-Timestamp"] = timestamp
            headers["X-Shield-Nonce"] = nonce

        try:
            response = self._session.request(
                method=method,
                url=url,
                headers=headers,
                data=body if body else None,
                params=None,
                timeout=self.timeout,
            )
        except requests.RequestException as e:
            raise ShieldError(
                message=f"Request failed: {str(e)}",
                status_code=0,
            )

        if not (200 <= response.status_code < 300):
            # Backend returns {"error": "..."} (always) and sometimes
            # {"message": "..."} with extra detail. Prefer message when present.
            error_message = response.text or response.reason
            try:
                error_body = response.json()
                error_message = (
                    error_body.get("message")
                    or error_body.get("error")
                    or error_message
                )
            except ValueError:
                pass
            raise ShieldError(
                message=error_message,
                status_code=response.status_code,
            )

        if raw_response:
            return response.content

        if not response.content:
            return {}

        return response.json()
