export { ShieldClient, SDK_USER_AGENT } from "./client";
export { AgentEvents } from "./resources/agent_events";
export { EventsPii, SessionsPii } from "./resources/pii";
export { verifyChain, computeEventHash, canonicalJSONStringify, formatTimestampForHash } from "./hashchain";
export type { ExportEvent, VerifyLocalResult } from "./hashchain";
export * from "./types";
