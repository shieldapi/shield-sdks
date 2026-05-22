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
