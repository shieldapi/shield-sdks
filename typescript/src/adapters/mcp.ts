import * as crypto from "node:crypto";
import { canonicalJSONStringify } from "../hashchain";
import { ShieldError } from "../types";
import type { AgentEventParams, ActionEvidenceParams, ShieldEvent } from "../types";

// Structural type — accept any object that can call actionToolCalled.
// Allows tests to inject a mock without constructing a real ShieldClient.
// Uses Omit<AgentEventParams, "event_type"> because actionToolCalled injects
// event_type internally via _callAction — callers must not pass it.
interface ShieldAgentLike {
  actionToolCalled(
    sessionId: string,
    params: Omit<AgentEventParams, "event_type"> & ActionEvidenceParams
  ): Promise<ShieldEvent>;
}

interface ShieldLike {
  agent: ShieldAgentLike;
}

export interface ShieldMcpAdapterConfig {
  shield: ShieldLike;
  sessionId: string;
  /** At least one of agentId or agentName is required. */
  agentId?: string;
  agentName?: string;
  agentProvider?: string;
  principalUserId?: string;
  authorityScope?: string[];
  /**
   * If true, a Shield logging failure is re-thrown instead of swallowed. Default false.
   * Note: if execute() throws and Shield logging also fails, the Shield error takes
   * precedence and the original tool error is not propagated.
   */
  throwOnShieldError?: boolean;
}

export interface RecordToolCallOptions<TInput = unknown, TOutput = unknown> {
  toolName: string;
  toolCallId?: string;
  /** Hashed locally with SHA-256. Never sent to Shield. */
  input: TInput;
  execute: (input: TInput) => Promise<TOutput>;
  /** Overrides the config-level authorityScope for this call only. */
  authorityScope?: string[];
}

function sha256hex(value: unknown): string {
  return crypto
    .createHash("sha256")
    .update(canonicalJSONStringify(value))
    .digest("hex");
}

export function createShieldMcpAdapter(config: ShieldMcpAdapterConfig) {
  const {
    shield,
    sessionId,
    agentId,
    agentName,
    agentProvider,
    principalUserId,
    authorityScope,
    throwOnShieldError = false,
  } = config;

  if (!agentId && !agentName) {
    throw new ShieldError(0, "agent_id or agent_name is required for MCP adapter");
  }

  async function recordToolCall<TInput, TOutput>(
    options: RecordToolCallOptions<TInput, TOutput>
  ): Promise<TOutput> {
    const { toolName, toolCallId, input, execute } = options;
    const effectiveScope = options.authorityScope ?? authorityScope;
    const inputHash = sha256hex(input);

    let output: TOutput;
    try {
      output = await execute(input);
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      const errorMessage = e.message.slice(0, 500);
      const errorClass = e.constructor.name;

      try {
        await shield.agent.actionToolCalled(sessionId, {
          agent_id: agentId,
          agent_name: agentName,
          agent_provider: agentProvider,
          principal_user_id: principalUserId,
          authority_scope: effectiveScope,
          input_hash: inputHash,
          action_type: "tool_call",
          tool_call_id: toolCallId,
          result: "error",
          data: { tool_name: toolName, error_message: errorMessage, error_class: errorClass },
        });
      } catch (shieldErr) {
        if (throwOnShieldError) throw shieldErr;
        console.error("[Shield MCP Adapter] Failed to log error event:", shieldErr);
      }

      throw err;
    }

    const outputHash = sha256hex(output);

    try {
      await shield.agent.actionToolCalled(sessionId, {
        agent_id: agentId,
        agent_name: agentName,
        agent_provider: agentProvider,
        principal_user_id: principalUserId,
        authority_scope: effectiveScope,
        input_hash: inputHash,
        output_hash: outputHash,
        action_type: "tool_call",
        tool_call_id: toolCallId,
        result: "success",
        data: { tool_name: toolName },
      });
    } catch (shieldErr) {
      if (throwOnShieldError) throw shieldErr;
      console.error("[Shield MCP Adapter] Failed to log success event:", shieldErr);
    }

    return output;
  }

  return { recordToolCall };
}
