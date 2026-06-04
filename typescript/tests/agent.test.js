// Tests for AgentEvents.logAction() — validation and request shape.
// Imports from dist/ (built by `npm run build` before `npm test`).

const test = require("node:test");
const assert = require("node:assert/strict");
const { AgentEvents } = require("../dist/resources/agent_events");
const { ShieldError } = require("../dist/types");

const VALID_HASH = "a".repeat(64);

function makeAgent(captureRef) {
  return new AgentEvents(async (method, path, body) => {
    captureRef.method = method;
    captureRef.path = path;
    captureRef.body = body;
    return { id: "evt_test", sequence: 1, hash: "h", created_at: "now" };
  });
}

test("logAction succeeds with agent_id", async () => {
  const cap = {};
  const agent = makeAgent(cap);
  await agent.logAction("ses_123", {
    event_type: "shield.content.submitted",
    agent_id: "agt-abc",
    agent_name: "gpt-4o",
  });
  assert.strictEqual(cap.method, "POST");
  assert.strictEqual(cap.path, "/sessions/ses_123/events/agent");
});

test("logAction passes actor through to request body", async () => {
  const cap = {};
  const agent = makeAgent(cap);
  await agent.logAction("ses_123", {
    event_type: "shield.content.submitted",
    agent_name: "claude-3",
    actor: "agt-playwright-browser-001",
  });
  assert.strictEqual(
    cap.body.actor,
    "agt-playwright-browser-001",
    "actor field must be forwarded verbatim in the request body"
  );
});

test("logAction injects actor_type: agent", async () => {
  const cap = {};
  const agent = makeAgent(cap);
  await agent.logAction("ses_123", {
    event_type: "shield.content.submitted",
    agent_name: "claude-3",
  });
  assert.strictEqual(cap.body.actor_type, "agent");
});

test("logAction rejects when neither agent_id nor agent_name provided", async () => {
  const agent = makeAgent({});
  await assert.rejects(
    () => agent.logAction("ses_123", { event_type: "shield.content.submitted" }),
    (err) => {
      assert.ok(err instanceof ShieldError, "must throw ShieldError");
      assert.match(err.message, /agent_id or agent_name/);
      return true;
    }
  );
});

test("logAction rejects prompt_hash with sha256: prefix", async () => {
  const agent = makeAgent({});
  await assert.rejects(
    () =>
      agent.logAction("ses_123", {
        event_type: "shield.content.submitted",
        agent_id: "agt-1",
        prompt_hash: "sha256:" + "a".repeat(64),
      }),
    (err) => {
      assert.ok(err instanceof ShieldError);
      assert.match(err.message, /prompt_hash/);
      return true;
    }
  );
});

test("logAction rejects hash shorter than 64 chars", async () => {
  const agent = makeAgent({});
  await assert.rejects(
    () =>
      agent.logAction("ses_123", {
        event_type: "shield.content.submitted",
        agent_id: "agt-1",
        output_hash: "abc123",
      }),
    (err) => {
      assert.ok(err instanceof ShieldError);
      assert.match(err.message, /output_hash/);
      return true;
    }
  );
});

test("logAction rejects hash with uppercase chars", async () => {
  const agent = makeAgent({});
  await assert.rejects(
    () =>
      agent.logAction("ses_123", {
        event_type: "shield.content.submitted",
        agent_name: "gpt-4",
        input_hash: "A".repeat(64),
      }),
    (err) => {
      assert.ok(err instanceof ShieldError);
      assert.match(err.message, /input_hash/);
      return true;
    }
  );
});

test("logAction accepts valid 64-char lowercase hex hashes", async () => {
  const cap = {};
  const agent = makeAgent(cap);
  await agent.logAction("ses_456", {
    event_type: "shield.content.submitted",
    agent_id: "agt-2",
    prompt_hash: VALID_HASH,
    input_hash: VALID_HASH,
    output_hash: VALID_HASH,
  });
  assert.strictEqual(cap.body.prompt_hash, VALID_HASH);
  assert.strictEqual(cap.body.output_hash, VALID_HASH);
});

test("logAction passes authority_scope as array", async () => {
  const cap = {};
  const agent = makeAgent(cap);
  await agent.logAction("ses_123", {
    event_type: "shield.content.submitted",
    agent_id: "agt-1",
    authority_scope: ["read:sessions", "write:events"],
  });
  assert.deepStrictEqual(cap.body.authority_scope, ["read:sessions", "write:events"]);
});

test("logAction passes through all optional fields", async () => {
  const cap = {};
  const agent = makeAgent(cap);
  await agent.logAction("ses_789", {
    event_type: "shield.agreement.signed",
    agent_id: "agt-3",
    agent_name: "claude-3-opus",
    agent_provider: "Anthropic",
    principal_user_id: "alice@example.com",
    model: "claude-3-opus-20240229",
    data: { contract: "ACME-2026-001" },
  });
  assert.strictEqual(cap.body.agent_provider, "Anthropic");
  assert.strictEqual(cap.body.principal_user_id, "alice@example.com");
  assert.strictEqual(cap.body.model, "claude-3-opus-20240229");
  assert.deepStrictEqual(cap.body.data, { contract: "ACME-2026-001" });
});

// ---------------------------------------------------------------------------
// Evidence Artifacts
// ---------------------------------------------------------------------------

const VALID_ARTIFACT_SHA = "a".repeat(64);

test("logAction forwards evidence_artifacts in request body", async () => {
  const cap = {};
  const agent = makeAgent(cap);
  const artifact = {
    artifact_type: "screenshot_before",
    sha256: VALID_ARTIFACT_SHA,
    uri: "s3://bucket/before.png",
    storage_provider: "customer_s3",
    content_type: "image/png",
    size_bytes: 245760,
  };
  await agent.logAction("ses_123", {
    event_type: "shield.agent.action.navigated",
    agent_id: "agt-1",
    evidence_artifacts: [artifact],
  });
  assert.ok(Array.isArray(cap.body.evidence_artifacts), "evidence_artifacts must be an array");
  assert.strictEqual(cap.body.evidence_artifacts[0].artifact_type, "screenshot_before");
  assert.strictEqual(cap.body.evidence_artifacts[0].sha256, VALID_ARTIFACT_SHA);
});

test("evidence_artifacts sha256 must not have sha256: prefix", async () => {
  const agent = makeAgent({});
  await assert.rejects(
    () =>
      agent._callAction("ses_123", "shield.agent.action.clicked", {
        agent_id: "agt-1",
        evidence_artifacts: [{ artifact_type: "screenshot_before", sha256: "sha256:" + VALID_ARTIFACT_SHA }],
      }),
    (err) => {
      assert.ok(err instanceof ShieldError);
      assert.match(err.message, /sha256/);
      return true;
    }
  );
});

test("evidence_artifacts sha256 must be 64-char lowercase hex", async () => {
  const agent = makeAgent({});
  await assert.rejects(
    () =>
      agent._callAction("ses_123", "shield.agent.action.clicked", {
        agent_id: "agt-1",
        evidence_artifacts: [{ artifact_type: "screenshot_before", sha256: "too-short" }],
      }),
    (err) => {
      assert.ok(err instanceof ShieldError);
      assert.match(err.message, /sha256/);
      return true;
    }
  );
});

test("evidence_artifacts artifact_type must be in allowlist", async () => {
  const agent = makeAgent({});
  await assert.rejects(
    () =>
      agent._callAction("ses_123", "shield.agent.action.navigated", {
        agent_id: "agt-1",
        evidence_artifacts: [{ artifact_type: "raw_screenshot", sha256: VALID_ARTIFACT_SHA }],
      }),
    (err) => {
      assert.ok(err instanceof ShieldError);
      assert.match(err.message, /artifact_type/);
      return true;
    }
  );
});

test("evidence_artifacts uri must use allowed scheme", async () => {
  const agent = makeAgent({});
  await assert.rejects(
    () =>
      agent._callAction("ses_123", "shield.agent.action.navigated", {
        agent_id: "agt-1",
        evidence_artifacts: [{ artifact_type: "screenshot_before", sha256: VALID_ARTIFACT_SHA, uri: "ftp://server/file.png" }],
      }),
    (err) => {
      assert.ok(err instanceof ShieldError);
      assert.match(err.message, /uri scheme/);
      return true;
    }
  );
});

test("evidence_artifacts storage_provider must be in allowlist", async () => {
  const agent = makeAgent({});
  await assert.rejects(
    () =>
      agent._callAction("ses_123", "shield.agent.action.clicked", {
        agent_id: "agt-1",
        evidence_artifacts: [{ artifact_type: "dom_before", sha256: VALID_ARTIFACT_SHA, storage_provider: "dropbox" }],
      }),
    (err) => {
      assert.ok(err instanceof ShieldError);
      assert.match(err.message, /storage_provider/);
      return true;
    }
  );
});

test("evidence_artifacts size_bytes must be >= 0", async () => {
  const agent = makeAgent({});
  await assert.rejects(
    () =>
      agent._callAction("ses_123", "shield.agent.action.navigated", {
        agent_id: "agt-1",
        evidence_artifacts: [{ artifact_type: "screenshot_before", sha256: VALID_ARTIFACT_SHA, size_bytes: -1 }],
      }),
    (err) => {
      assert.ok(err instanceof ShieldError);
      assert.match(err.message, /size_bytes/);
      return true;
    }
  );
});

test("evidence_artifacts raw bytes are never in request body", async () => {
  const cap = {};
  const agent = makeAgent(cap);
  await agent.logAction("ses_123", {
    event_type: "shield.agent.action.navigated",
    agent_id: "agt-1",
    evidence_artifacts: [{ artifact_type: "screenshot_before", sha256: VALID_ARTIFACT_SHA }],
  });
  const body = JSON.stringify(cap.body);
  assert.ok(!body.includes("raw_content"), "raw_content must never appear in Shield payload");
  assert.ok(!body.includes("raw_bytes"), "raw_bytes must never appear in Shield payload");
});

test("empty evidence_artifacts array is accepted", async () => {
  const cap = {};
  const agent = makeAgent(cap);
  await agent.logAction("ses_123", {
    event_type: "shield.agent.action.navigated",
    agent_id: "agt-1",
    evidence_artifacts: [],
  });
  // No error thrown
});
