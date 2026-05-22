import type { ShieldEvent, AgentEventParams } from "../types";
import { ShieldError } from "../types";

const HASH_RE = /^[0-9a-f]{64}$/;
const HASH_FIELDS = ["prompt_hash", "input_hash", "output_hash"] as const;

export class AgentEvents {
  private _request: (method: string, path: string, body?: unknown) => Promise<unknown>;

  constructor(request: (method: string, path: string, body?: unknown) => Promise<unknown>) {
    this._request = request;
  }

  async logAction(sessionId: string, params: AgentEventParams): Promise<ShieldEvent> {
    if (!params.agent_id && !params.agent_name) {
      throw new ShieldError(0, "agent_id or agent_name is required for agent evidence events");
    }
    for (const field of HASH_FIELDS) {
      const val = params[field];
      if (val !== undefined && !HASH_RE.test(val)) {
        throw new ShieldError(
          0,
          `${field} must be a bare 64-character lowercase SHA-256 hex digest (no sha256: prefix)`
        );
      }
    }
    const body = { actor_type: "agent", ...params };
    return this._request("POST", `/sessions/${sessionId}/events/agent`, body) as Promise<ShieldEvent>;
  }
}
