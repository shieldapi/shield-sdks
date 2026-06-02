/**
 * Shield Standard Event Taxonomy v1.0 — 40 event types.
 */
export enum ShieldEventType {
  // Party (5)
  PartyJoined = "shield.party.joined",
  PartyLeft = "shield.party.left",
  PartyIdentityVerified = "shield.party.identity.verified",
  PartyIdentityFailed = "shield.party.identity.failed",
  PartyRoleAssigned = "shield.party.role.assigned",

  // Session (5)
  SessionCreated = "shield.session.created",
  SessionOpened = "shield.session.opened",
  SessionClosed = "shield.session.closed",
  SessionExpired = "shield.session.expired",
  SessionArchived = "shield.session.archived",

  // Content (6)
  ContentUploaded = "shield.content.uploaded",
  ContentViewed = "shield.content.viewed",
  ContentDownloaded = "shield.content.downloaded",
  ContentDeleted = "shield.content.deleted",
  ContentHashVerified = "shield.content.hash.verified",
  ContentSubmitted = "shield.content.submitted",

  // Negotiation (7)
  NegotiationTermsProposed = "shield.negotiation.terms.proposed",
  NegotiationTermsAccepted = "shield.negotiation.terms.accepted",
  NegotiationTermsRejected = "shield.negotiation.terms.rejected",
  NegotiationTermsModified = "shield.negotiation.terms.modified",
  NegotiationTermsExpired = "shield.negotiation.terms.expired",
  NegotiationMessageSent = "shield.negotiation.message.sent",
  NegotiationMessageRead = "shield.negotiation.message.read",

  // Agreement (7)
  AgreementDrafted = "shield.agreement.drafted",
  AgreementReviewed = "shield.agreement.reviewed",
  AgreementApproved = "shield.agreement.approved",
  AgreementSigned = "shield.agreement.signed",
  AgreementCountersigned = "shield.agreement.countersigned",
  AgreementVoided = "shield.agreement.voided",
  AgreementReached = "shield.agreement.reached",

  // Access (4)
  AccessGranted = "shield.access.granted",
  AccessRevoked = "shield.access.revoked",
  AccessAttempted = "shield.access.attempted",
  AccessDenied = "shield.access.denied",

  // Disclosure (3)
  DisclosurePresented = "shield.disclosure.presented",
  DisclosureAcknowledged = "shield.disclosure.acknowledged",
  DisclosureDeclined = "shield.disclosure.declined",

  // Evidence (3)
  EvidenceExported = "shield.evidence.exported",
  EvidenceVerified = "shield.evidence.verified",
  EvidenceTamperedDetected = "shield.evidence.tampered_detected",
}

/**
 * shield.agent.action.* event types for Agent Action Evidence v1.
 */
export enum AgentActionEventType {
  Navigated              = "shield.agent.action.navigated",
  Clicked                = "shield.agent.action.clicked",
  InputFilled            = "shield.agent.action.input_filled",
  Submitted              = "shield.agent.action.submitted",
  Confirmed              = "shield.agent.action.confirmed",
  PaymentInitiated       = "shield.agent.action.payment_initiated",
  PaymentConfirmed       = "shield.agent.action.payment_confirmed",
  ToolCalled             = "shield.agent.action.tool_called",
  HumanApprovalRequested = "shield.agent.action.human_approval_requested",
  HumanApprovalGranted   = "shield.agent.action.human_approval_granted",
}

/**
 * Structured evidence for shield.agent.action.* events.
 * Hash fields must be bare 64-character lowercase SHA-256 hex digests (no sha256: prefix).
 */
export interface ActionEvidenceParams {
  action_type?: string;
  target_url?: string;
  page_title?: string;
  element_selector?: string;
  element_text?: string;
  /** Bare 64-char lowercase SHA-256 hex digest of the screenshot before the action. */
  screenshot_before_hash?: string;
  /** Bare 64-char lowercase SHA-256 hex digest of the screenshot after the action. */
  screenshot_after_hash?: string;
  /** Bare 64-char lowercase SHA-256 hex digest of the DOM before the action. */
  dom_before_hash?: string;
  /** Bare 64-char lowercase SHA-256 hex digest of the DOM after the action. */
  dom_after_hash?: string;
  browser_session_id?: string;
  tool_call_id?: string;
  risk_level?: string;
  /** Required for payment_initiated / payment_confirmed. */
  amount?: number;
  /** Required for payment_initiated / payment_confirmed. */
  currency?: string;
  result?: string;
  /**
   * Optional references to externally-stored evidence artifacts.
   * Each artifact's sha256 is sealed into the hash chain. Shield does not store raw bytes.
   */
  evidence_artifacts?: EvidenceArtifact[];
}

/** Allowed artifact_type values for EvidenceArtifact. */
export type ArtifactType =
  | "screenshot_before"
  | "screenshot_after"
  | "dom_before"
  | "dom_after"
  | "input"
  | "output"
  | "trace"
  | "receipt"
  | "other";

/** Allowed storage_provider values for EvidenceArtifact. */
export type StorageProvider =
  | "customer_s3"
  | "customer_r2"
  | "customer_gcs"
  | "customer_azure_blob"
  | "shield_storage"
  | "external";

/**
 * A reference to an externally-stored evidence artifact.
 * Shield seals the uri + sha256 into the tamper-evident hash chain.
 * Shield does NOT store raw artifact bytes — callers upload to their own
 * storage and pass the resulting uri + sha256 here.
 */
export interface EvidenceArtifact {
  /** Required. Classifies the artifact. */
  artifact_type: ArtifactType;
  /**
   * Required. Bare 64-character lowercase SHA-256 hex digest of the artifact bytes.
   * No "sha256:" prefix. Used by Shield to detect tampering.
   */
  sha256: string;
  /** URI of the artifact in external storage (http/https/s3/gs/azure/r2). */
  uri?: string;
  /** Identifies the storage backend. */
  storage_provider?: StorageProvider;
  /** MIME type (e.g. "image/png", "text/html"). Max 128 chars. */
  content_type?: string;
  /** Size of the artifact in bytes. Must be >= 0. */
  size_bytes?: number;
  /** RFC3339 timestamp when the artifact was captured. */
  captured_at?: string;
  /** Customer-defined retention label. Max 128 chars. */
  retention_policy?: string;
  /** Whether PII redaction was applied before storage. */
  redaction_applied?: boolean;
  /** Additional customer-defined metadata. Max 4096 bytes when serialized. */
  metadata?: Record<string, unknown>;
}

export interface ShieldEvent {
  id: string;
  session_id: string;
  actor: string;
  event_type: ShieldEventType | string;
  data?: Record<string, unknown>;
  hash: string;
  sequence: number;
  created_at: string;
}

export interface ShieldSession {
  id: string;
  org_id: string;
  title: string;
  status: string;
  created_at: string;
  closed_at: string | null;
  participant_count: number;
  event_count: number;
  tsa_status: string;
  tsa_timestamp: string | null;
}

export interface ShieldVerifyResult {
  valid: boolean;
  total_events: number;
  verified_events: number;
  broken_at: number | null;
  tsa_status: string;
  tsa_timestamp: string | null;
  tsa_token: string | null;
}

export class ShieldError extends Error {
  public status: number;
  public code?: string;
  public fields?: Record<string, unknown>;

  constructor(status: number, message: string, code?: string, fields?: Record<string, unknown>) {
    super(message);
    this.name = "ShieldError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export interface CreateSessionParams {
  title: string;
}

export interface CreateEventParams {
  session_id: string;
  event_type: ShieldEventType | string;
  actor: string;
  data?: Record<string, unknown>;
}

export type ExportFormat = "json" | "pdf";

export interface AgentEventParams {
  event_type: ShieldEventType | string;
  /**
   * Display identifier for the actor performing the action (e.g. the agent ID,
   * agent name, or a descriptive label). Defaults to agent_id ?? agent_name ??
   * "agent" when omitted by callers who use the Playwright or MCP adapters.
   * Required by the backend; omitting it sends no actor label.
   */
  actor?: string;
  /** At least one of agent_id or agent_name is required. */
  agent_id?: string;
  agent_name?: string;
  agent_provider?: string;
  principal_user_id?: string;
  authority_scope?: string[];
  model?: string;
  model_version?: string;
  /** Bare 64-character lowercase SHA-256 hex digest — no prefix. */
  prompt_hash?: string;
  /** Bare 64-character lowercase SHA-256 hex digest — no prefix. */
  input_hash?: string;
  /** Bare 64-character lowercase SHA-256 hex digest — no prefix. */
  output_hash?: string;
  human_approval_event_id?: string;
  parent_event_id?: string;
  data?: Record<string, unknown>;
}

export interface ShieldClientOptions {
  baseUrl?: string;
  hmacSecret?: string;
}
