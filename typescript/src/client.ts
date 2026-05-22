import * as crypto from "crypto";
import { ShieldError } from "./types";
import type { ShieldClientOptions } from "./types";
import { Sessions } from "./resources/sessions";
import { Events } from "./resources/events";
import { Verify } from "./resources/verify";
import { AgentEvents } from "./resources/agent_events";

// ARCH-019: kept static so the SDK does not leak runtime (node version) or OS
// into server logs. Bumped alongside package.json version on each release.
export const SDK_USER_AGENT = "shield-js/0.3.1";

export class ShieldClient {
  private apiKey: string;
  private baseUrl: string;
  private baseUrlPath: string;
  private hmacSecret?: string;

  public sessions: Sessions;
  public events: Events;
  public verify: Verify;
  public agent: AgentEvents;

  constructor(apiKey: string, options?: ShieldClientOptions) {
    if (!options?.hmacSecret) {
      throw new ShieldError(
        0,
        "hmacSecret is required. All write operations must be signed. " +
          "See https://docs.getshield.dev/authentication"
      );
    }
    this.apiKey = apiKey;
    this.baseUrl = (options?.baseUrl ?? "https://api.getshield.dev/api/v1").replace(/\/+$/, "");
    if (!this.baseUrl.endsWith("/api/v1")) {
      this.baseUrl += "/api/v1";
    }
    // Cache path component of baseUrl so HMAC signing includes it.
    // The server validates against RequestURI() (/api/v1/sessions/...),
    // not just the resource path (/sessions/...).
    try {
      this.baseUrlPath = new URL(this.baseUrl).pathname.replace(/\/+$/, "");
    } catch {
      this.baseUrlPath = "";
    }
    this.hmacSecret = options?.hmacSecret;

    const request = this._request.bind(this);
    const rawRequest = this._rawRequest.bind(this);

    this.sessions = new Sessions(request, rawRequest);
    this.events = new Events(request);
    this.verify = new Verify(request);
    this.agent = new AgentEvents(request);
  }

  private async _rawRequest(method: string, path: string, body?: unknown): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    const bodyStr = body != null ? JSON.stringify(body) : "";

    const headers: Record<string, string> = {
      "X-Shield-Key": this.apiKey,
      "Content-Type": "application/json",
      // Browsers silently drop User-Agent overrides (forbidden header per
      // fetch spec), so we also send X-Shield-Client for browser callers.
      // Node preserves User-Agent, which is the primary signal for server ops.
      "User-Agent": SDK_USER_AGENT,
      "X-Shield-Client": SDK_USER_AGENT,
    };

    if (this.hmacSecret) {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const nonce = crypto.randomUUID();
      const bodyHash = crypto.createHash("sha256").update(bodyStr).digest("hex");
      // C-1 (v0.1.6): the canonical message includes the full request target
      // (path + any ?query string). Callers pass `path` as the exact string
      // appended to baseUrl and sent over the wire, so signing it verbatim —
      // without stripping via URL.pathname — matches what the server validates
      // via http.Request.URL.RequestURI(). A caller passing different query
      // strings against the same path yields different signatures, preventing
      // query-tampering replays.
      const pathWithQuery = this.baseUrlPath + path;
      const message = `${timestamp}.${method}.${pathWithQuery}.${bodyHash}`;
      const signature = crypto
        .createHmac("sha256", this.hmacSecret)
        .update(message)
        .digest("hex");

      headers["X-Shield-Signature"] = signature;
      headers["X-Shield-Timestamp"] = timestamp;
      headers["X-Shield-Nonce"] = nonce;
    }

    const fetchOptions: RequestInit = {
      method,
      headers,
    };

    if (body != null) {
      fetchOptions.body = bodyStr;
    }

    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      let errorBody: {
        error?: string;
        message?: string;
        code?: string;
        fields?: Record<string, unknown>;
      } = {};
      try {
        errorBody = await response.json() as typeof errorBody;
      } catch {
        // response may not be JSON
      }
      // Backend returns {"error": "..."} (always) and optionally {"message", "code", "fields"}.
      // Prefer message when present, else error, else HTTP statusText. "code" and "fields"
      // are additive (ARCH-018) — surfaced on ShieldError for callers that want to switch
      // on them. Absence on older servers is fine; they stay undefined.
      const message = errorBody.message ?? errorBody.error ?? response.statusText;
      throw new ShieldError(response.status, message, errorBody.code, errorBody.fields);
    }

    return response;
  }

  private async _request(method: string, path: string, body?: unknown): Promise<unknown> {
    const response = await this._rawRequest(method, path, body);
    return response.json();
  }
}
