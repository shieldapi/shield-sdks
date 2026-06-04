export { ShieldClient, SDK_USER_AGENT } from "./client";
export { AgentEvents } from "./resources/agent_events";
export { EventsPii, SessionsPii } from "./resources/pii";
export { verifyChain, computeEventHash, canonicalJSONStringify, formatTimestampForHash } from "./hashchain";
export type { ExportEvent, VerifyLocalResult } from "./hashchain";
export * from "./types";
export { createShieldMcpAdapter } from "./adapters/mcp";
export type { ShieldMcpAdapterConfig, RecordToolCallOptions } from "./adapters/mcp";
export { createShieldPlaywrightAdapter } from "./adapters/playwright";
export type {
  ShieldPlaywrightAdapterConfig,
  NavigateOptions,
  ClickOptions,
  FillOptions,
  SubmitOptions,
  ConfirmPaymentOptions,
} from "./adapters/playwright";
