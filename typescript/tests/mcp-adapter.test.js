// Tests for createShieldMcpAdapter — validation and request shape.
// Imports from dist/ (built by `npm run build` before `npm test`).

const test = require("node:test");
const assert = require("node:assert/strict");
const { createShieldMcpAdapter } = require("../dist/adapters/mcp");
const { ShieldError } = require("../dist/types");

const VALID_HASH_RE = /^[0-9a-f]{64}$/;

function makeShield(captureRef) {
  return {
    agent: {
      actionToolCalled: async (sessionId, params) => {
        captureRef.sessionId = sessionId;
        captureRef.params = { ...params };
        return { id: "evt_test", sequence: 1, hash: "h", created_at: "now" };
      },
    },
  };
}

function makeAdapter(captureRef, overrides = {}) {
  return createShieldMcpAdapter({
    shield: makeShield(captureRef),
    sessionId: "ses_123",
    agentId: "agt-test",
    ...overrides,
  });
}

test("successful tool call invokes actionToolCalled once", async () => {
  let callCount = 0;
  const shield = {
    agent: {
      actionToolCalled: async () => {
        callCount++;
        return { id: "evt_test", sequence: 1, hash: "h", created_at: "now" };
      },
    },
  };
  const adapter = createShieldMcpAdapter({ shield, sessionId: "ses_123", agentId: "agt-1" });
  await adapter.recordToolCall({
    toolName: "browser.click",
    input: { selector: "#btn" },
    execute: async (input) => ({ clicked: true }),
  });
  assert.strictEqual(callCount, 1);
});

test("result is success on successful tool call", async () => {
  const cap = {};
  const adapter = makeAdapter(cap);
  await adapter.recordToolCall({
    toolName: "read_file",
    input: { path: "/tmp/foo.txt" },
    execute: async (input) => ({ content: "hello" }),
  });
  assert.strictEqual(cap.params.result, "success");
});

test("input_hash is 64-char lowercase hex", async () => {
  const cap = {};
  const adapter = makeAdapter(cap);
  await adapter.recordToolCall({
    toolName: "read_file",
    input: { path: "/tmp/foo.txt" },
    execute: async (input) => "result",
  });
  assert.match(cap.params.input_hash, VALID_HASH_RE);
});

test("output_hash is present on success and is 64-char lowercase hex", async () => {
  const cap = {};
  const adapter = makeAdapter(cap);
  await adapter.recordToolCall({
    toolName: "read_file",
    input: { path: "/tmp/foo.txt" },
    execute: async (input) => "result",
  });
  assert.ok(cap.params.output_hash, "output_hash must be present on success");
  assert.match(cap.params.output_hash, VALID_HASH_RE);
});

test("raw input is not sent to Shield", async () => {
  const cap = {};
  const adapter = makeAdapter(cap);
  await adapter.recordToolCall({
    toolName: "tool",
    input: { secret_key: "do-not-send" },
    execute: async (input) => "ok",
  });
  assert.strictEqual(cap.params.input, undefined);
  assert.strictEqual(cap.params.data && cap.params.data.input, undefined);
  const body = JSON.stringify(cap.params);
  assert.ok(!body.includes("do-not-send"), "raw input value must not appear in Shield payload");
});

test("raw output is not sent to Shield", async () => {
  const cap = {};
  const adapter = makeAdapter(cap);
  await adapter.recordToolCall({
    toolName: "tool",
    input: {},
    execute: async (input) => ({ secret_output: "do-not-send" }),
  });
  assert.strictEqual(cap.params.output, undefined);
  assert.strictEqual(cap.params.data && cap.params.data.output, undefined);
  const body = JSON.stringify(cap.params);
  assert.ok(!body.includes("do-not-send"), "raw output value must not appear in Shield payload");
});

test("failed tool call logs result: error", async () => {
  const cap = {};
  const adapter = makeAdapter(cap);
  await assert.rejects(
    () =>
      adapter.recordToolCall({
        toolName: "failing_tool",
        input: { x: 1 },
        execute: async () => {
          throw new Error("network timeout");
        },
      }),
    Error
  );
  assert.strictEqual(cap.params.result, "error");
});

test("failed tool call has input_hash but no output_hash", async () => {
  const cap = {};
  const adapter = makeAdapter(cap);
  await assert.rejects(
    () =>
      adapter.recordToolCall({
        toolName: "failing_tool",
        input: { x: 1 },
        execute: async () => {
          throw new Error("oops");
        },
      }),
    Error
  );
  assert.match(cap.params.input_hash, VALID_HASH_RE);
  assert.strictEqual(cap.params.output_hash, undefined);
});

test("failed tool call re-throws original error", async () => {
  const cap = {};
  const adapter = makeAdapter(cap);
  const originalError = new TypeError("original error");
  await assert.rejects(
    () =>
      adapter.recordToolCall({
        toolName: "failing_tool",
        input: {},
        execute: async () => {
          throw originalError;
        },
      }),
    (err) => {
      assert.strictEqual(err, originalError);
      return true;
    }
  );
});

test("tool_call_id is passed through to Shield", async () => {
  const cap = {};
  const adapter = makeAdapter(cap);
  await adapter.recordToolCall({
    toolName: "some_tool",
    toolCallId: "call_abc123",
    input: {},
    execute: async (input) => "result",
  });
  assert.strictEqual(cap.params.tool_call_id, "call_abc123");
});

test("per-call authorityScope overrides config default", async () => {
  const cap = {};
  const adapter = createShieldMcpAdapter({
    shield: makeShield(cap),
    sessionId: "ses_123",
    agentId: "agt-1",
    authorityScope: ["default:scope"],
  });
  await adapter.recordToolCall({
    toolName: "tool",
    input: {},
    execute: async (input) => "ok",
    authorityScope: ["override:scope"],
  });
  assert.deepStrictEqual(cap.params.authority_scope, ["override:scope"]);
});

test("missing agent identity throws ShieldError, execute is never called", () => {
  assert.throws(
    () =>
      createShieldMcpAdapter({
        shield: makeShield({}),
        sessionId: "ses_123",
        // no agentId or agentName
      }),
    (err) => {
      assert.ok(err instanceof ShieldError);
      assert.match(err.message, /agent_id or agent_name/);
      return true;
    }
  );
});

test("execute receives input argument", async () => {
  let receivedInput;
  const cap = {};
  const adapter = makeAdapter(cap);
  const inputValue = { key: "value", num: 42 };
  await adapter.recordToolCall({
    toolName: "tool",
    input: inputValue,
    execute: async (input) => {
      receivedInput = input;
      return "ok";
    },
  });
  assert.deepStrictEqual(receivedInput, inputValue);
});

test("no sha256: prefix in any hash field", async () => {
  const cap = {};
  const adapter = makeAdapter(cap);
  await adapter.recordToolCall({
    toolName: "tool",
    input: { data: "something" },
    execute: async (input) => ({ result: "value" }),
  });
  for (const field of ["input_hash", "output_hash"]) {
    const val = cap.params[field];
    if (val !== undefined) {
      assert.ok(!val.startsWith("sha256:"), `${field} must not have sha256: prefix`);
    }
  }
});

test("agentName alone is accepted and forwarded", async () => {
  const cap = {};
  const adapter = createShieldMcpAdapter({
    shield: makeShield(cap),
    sessionId: "ses_123",
    agentName: "gpt-4o",  // no agentId
  });
  await adapter.recordToolCall({
    toolName: "tool",
    input: {},
    execute: async (input) => "ok",
  });
  assert.strictEqual(cap.params.agent_name, "gpt-4o");
});

test("config agentId is forwarded as agent_id", async () => {
  const cap = {};
  const adapter = makeAdapter(cap);  // uses agentId: "agt-test"
  await adapter.recordToolCall({
    toolName: "tool",
    input: {},
    execute: async (input) => "ok",
  });
  assert.strictEqual(cap.params.agent_id, "agt-test");
});

test("toolName is forwarded as tool_name in data", async () => {
  const cap = {};
  const adapter = makeAdapter(cap);
  await adapter.recordToolCall({
    toolName: "read_file",
    input: {},
    execute: async (input) => "ok",
  });
  assert.strictEqual(cap.params.data && cap.params.data.tool_name, "read_file");
});

test("Shield failure is swallowed by default (throwOnShieldError false)", async () => {
  const adapter = createShieldMcpAdapter({
    shield: { agent: { actionToolCalled: async () => { throw new Error("shield down"); } } },
    sessionId: "ses_123",
    agentId: "agt-1",
  });
  const result = await adapter.recordToolCall({
    toolName: "tool",
    input: {},
    execute: async (input) => "ok",
  });
  assert.strictEqual(result, "ok");
});

test("Shield failure rethrows when throwOnShieldError is true", async () => {
  const adapter = createShieldMcpAdapter({
    shield: { agent: { actionToolCalled: async () => { throw new Error("shield down"); } } },
    sessionId: "ses_123",
    agentId: "agt-1",
    throwOnShieldError: true,
  });
  await assert.rejects(
    () =>
      adapter.recordToolCall({
        toolName: "tool",
        input: {},
        execute: async (input) => "ok",
      }),
    (err) => {
      assert.strictEqual(err.message, "shield down");
      return true;
    }
  );
});
