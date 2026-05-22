import type { ShieldSession, CreateSessionParams, ExportFormat } from "../types";
import { verifyChain, type ExportEvent, type VerifyLocalResult } from "../hashchain";
import { SessionsPii } from "./pii";

export class Sessions {
  private _request: (method: string, path: string, body?: unknown) => Promise<unknown>;
  private _rawRequest: (method: string, path: string, body?: unknown) => Promise<Response>;
  public pii: SessionsPii;

  constructor(
    request: (method: string, path: string, body?: unknown) => Promise<unknown>,
    rawRequest: (method: string, path: string, body?: unknown) => Promise<Response>,
  ) {
    this._request = request;
    this._rawRequest = rawRequest;
    this.pii = new SessionsPii(request);
  }

  async create(params: CreateSessionParams): Promise<ShieldSession> {
    return this._request("POST", "/sessions", params) as Promise<ShieldSession>;
  }

  async retrieve(id: string): Promise<ShieldSession> {
    return this._request("GET", `/sessions/${id}`) as Promise<ShieldSession>;
  }

  export(id: string, opts: { format: "json" }): Promise<Record<string, unknown>[]>;
  export(id: string, opts: { format: "pdf" }): Promise<Response>;
  async export(id: string, opts: { format: ExportFormat }): Promise<Record<string, unknown>[] | Response> {
    if (opts.format === "pdf") {
      return this._rawRequest("GET", `/sessions/${id}/export/pdf`);
    }
    // The API streams NDJSON (one JSON object per line). response.json() would
    // fail on multi-line NDJSON, so fetch raw text and parse each line independently —
    // same approach as verifyLocal().
    const resp = await this._rawRequest("GET", `/sessions/${id}/export/json`);
    const body = await resp.text();
    const records: Record<string, unknown>[] = [];
    for (const line of body.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        records.push(JSON.parse(line) as Record<string, unknown>);
      } catch {
        continue; // skip malformed lines
      }
    }
    return records;
  }

  async close(id: string): Promise<{ id: string; status: string; closed_at: string }> {
    return this._request("POST", `/sessions/${id}/close`) as Promise<{ id: string; status: string; closed_at: string }>;
  }

  /**
   * Request an RFC 3161 timestamp against the session's hash chain tip.
   *
   * **Async** — the server returns 202 immediately. Poll `verify.session(id)`
   * and check `tsa_status` until it becomes `"success"` or `"failed"`.
   */
  async stamp(id: string): Promise<{ session_id: string; tsa_status: string; message: string }> {
    return this._request("POST", `/sessions/${id}/stamp`) as Promise<{ session_id: string; tsa_status: string; message: string }>;
  }

  // ARCH-020: recompute every event hash client-side and re-check the
  // prev_hash linkage from genesis. Fetches the NDJSON export stream (the
  // same artifact legal discovery uses) so the bytes being verified are the
  // same bytes an auditor would replay offline. Trust-but-verify: a caller
  // who does not want to trust the server's /verify result can run this
  // locally and fail loud on any divergence.
  async verifyLocal(id: string): Promise<VerifyLocalResult> {
    const resp = await this._rawRequest("GET", `/sessions/${id}/export/json`);
    const body = await resp.text();
    const events: ExportEvent[] = [];
    for (const line of body.split(/\r?\n/)) {
      if (!line) continue;
      let parsed: { type?: string; event?: ExportEvent };
      try {
        parsed = JSON.parse(line);
      } catch {
        continue; // skip malformed lines; footer/header are always JSON
      }
      if (parsed.type === "event" && parsed.event) {
        events.push(parsed.event);
      }
    }
    return verifyChain(events);
  }
}
