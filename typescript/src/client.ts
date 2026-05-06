import * as crypto from "crypto";
import { ShieldError } from "./types";
import type { ShieldClientOptions } from "./types";
import { Sessions } from "./resources/sessions";
import { Events } from "./resources/events";
import { Verify } from "./resources/verify";

export class ShieldClient {
  private apiKey: string;
  private baseUrl: string;
  private hmacSecret?: string;

  public sessions: Sessions;
  public events: Events;
  public verify: Verify;

  constructor(apiKey: string, options?: ShieldClientOptions) {
    this.apiKey = apiKey;
    this.baseUrl = (options?.baseUrl ?? "https://getshield.dev/api/v1").replace(/\/+$/, "");
    this.hmacSecret = options?.hmacSecret;

    const request = this._request.bind(this);
    const rawRequest = this._rawRequest.bind(this);

    this.sessions = new Sessions(request, rawRequest);
    this.events = new Events(request);
    this.verify = new Verify(request);
  }

  private async _rawRequest(method: string, path: string, body?: unknown): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    const bodyStr = body != null ? JSON.stringify(body) : "";

    const headers: Record<string, string> = {
      "X-Shield-Key": this.apiKey,
      "Content-Type": "application/json",
    };

    if (this.hmacSecret) {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const bodyHash = crypto.createHash("sha256").update(bodyStr).digest("hex");
      const message = `${timestamp}.${method}.${path}.${bodyHash}`;
      const signature = crypto
        .createHmac("sha256", this.hmacSecret)
        .update(message)
        .digest("hex");

      headers["X-Shield-Signature"] = signature;
      headers["X-Shield-Timestamp"] = timestamp;
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
      let errorBody: { code?: string; message?: string } = {};
      try {
        errorBody = await response.json() as { code?: string; message?: string };
      } catch {
        // response may not be JSON
      }
      throw new ShieldError(
        response.status,
        errorBody.message ?? response.statusText,
        errorBody.code,
      );
    }

    return response;
  }

  private async _request(method: string, path: string, body?: unknown): Promise<unknown> {
    const response = await this._rawRequest(method, path, body);
    return response.json();
  }
}
