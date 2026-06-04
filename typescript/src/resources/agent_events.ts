import type { ShieldEvent, AgentEventParams, ActionEvidenceParams, EvidenceArtifact } from "../types";
import { ShieldError } from "../types";

const HASH_RE = /^[0-9a-f]{64}$/;
const HASH_FIELDS = ["prompt_hash", "input_hash", "output_hash"] as const;

const BARE_HASH_RE = /^[0-9a-f]{64}$/;
const ACTION_HASH_FIELDS = [
  "screenshot_before_hash",
  "screenshot_after_hash",
  "dom_before_hash",
  "dom_after_hash",
] as const;

const ARTIFACT_TYPES = new Set([
  "screenshot_before", "screenshot_after",
  "dom_before", "dom_after",
  "input", "output", "trace", "receipt", "other",
]);

const ARTIFACT_URI_SCHEMES = ["http://", "https://", "s3://", "gs://", "azure://", "r2://"];

const STORAGE_PROVIDERS = new Set([
  "customer_s3", "customer_r2", "customer_gcs",
  "customer_azure_blob", "shield_storage", "external",
]);

function validateEvidenceArtifacts(artifacts: EvidenceArtifact[] | undefined): void {
  if (!artifacts || artifacts.length === 0) return;
  if (artifacts.length > 20) {
    throw new ShieldError(0, "evidence_artifacts: maximum 20 artifacts per event");
  }
  for (let i = 0; i < artifacts.length; i++) {
    const a = artifacts[i];
    if (!ARTIFACT_TYPES.has(a.artifact_type)) {
      throw new ShieldError(0, `evidence_artifacts[${i}]: artifact_type "${a.artifact_type}" is not valid`);
    }
    if (!BARE_HASH_RE.test(a.sha256)) {
      throw new ShieldError(0, `evidence_artifacts[${i}]: sha256 must be a bare 64-character lowercase SHA-256 hex digest (no sha256: prefix)`);
    }
    if (a.uri !== undefined && a.uri !== "") {
      const lower = a.uri.toLowerCase();
      if (!ARTIFACT_URI_SCHEMES.some((s) => lower.startsWith(s))) {
        throw new ShieldError(0, `evidence_artifacts[${i}]: uri scheme must be http, https, s3, gs, azure, or r2`);
      }
    }
    if (a.storage_provider !== undefined && (a.storage_provider as string) !== "" && !STORAGE_PROVIDERS.has(a.storage_provider)) {
      throw new ShieldError(0, `evidence_artifacts[${i}]: storage_provider "${a.storage_provider}" is not valid`);
    }
    if (a.size_bytes !== undefined && a.size_bytes < 0) {
      throw new ShieldError(0, `evidence_artifacts[${i}]: size_bytes must be >= 0`);
    }
    if (a.content_type !== undefined && a.content_type.length > 128) {
      throw new ShieldError(0, `evidence_artifacts[${i}]: content_type exceeds 128 characters`);
    }
  }
}

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

  /** Record an agent browser navigation. */
  async actionNavigated(
    sessionId: string,
    params: AgentEventParams & ActionEvidenceParams
  ): Promise<ShieldEvent> {
    return this._callAction(sessionId, "shield.agent.action.navigated", params);
  }

  /** Record an agent element click. */
  async actionClicked(
    sessionId: string,
    params: AgentEventParams & ActionEvidenceParams
  ): Promise<ShieldEvent> {
    return this._callAction(sessionId, "shield.agent.action.clicked", params);
  }

  /** Record an agent form submission. */
  async actionSubmitted(
    sessionId: string,
    params: AgentEventParams & ActionEvidenceParams
  ): Promise<ShieldEvent> {
    return this._callAction(sessionId, "shield.agent.action.submitted", params);
  }

  /** Record an agent tool/function call. */
  async actionToolCalled(
    sessionId: string,
    params: AgentEventParams & ActionEvidenceParams
  ): Promise<ShieldEvent> {
    return this._callAction(sessionId, "shield.agent.action.tool_called", params);
  }

  /**
   * Record a confirmed payment action.
   * Requires amount, currency, and either human_approval_event_id or
   * authority_scope containing a payment permission string.
   */
  async actionPaymentConfirmed(
    sessionId: string,
    params: AgentEventParams & ActionEvidenceParams
  ): Promise<ShieldEvent> {
    return this._callAction(sessionId, "shield.agent.action.payment_confirmed", params);
  }

  /** Internal dispatcher: validates action hash fields, then delegates to logAction. */
  private async _callAction(
    sessionId: string,
    eventType: string,
    params: AgentEventParams & ActionEvidenceParams
  ): Promise<ShieldEvent> {
    for (const field of ACTION_HASH_FIELDS) {
      const val = (params as unknown as Record<string, unknown>)[field];
      if (val !== undefined && typeof val === "string" && !BARE_HASH_RE.test(val)) {
        throw new ShieldError(
          0,
          `${field} must be a bare 64-character lowercase SHA-256 hex digest (no sha256: prefix)`
        );
      }
    }
    validateEvidenceArtifacts(params.evidence_artifacts);
    return this.logAction(sessionId, { ...params, event_type: eventType });
  }
}
