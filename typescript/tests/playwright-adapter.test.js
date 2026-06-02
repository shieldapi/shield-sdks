// Tests for createShieldPlaywrightAdapter — no real Playwright required.
// Imports from dist/ (built by `npm run build` before `npm test`).

const test = require("node:test");
const assert = require("node:assert/strict");
const { createShieldPlaywrightAdapter } = require("../dist/adapters/playwright");
const { ShieldError } = require("../dist/types");

const VALID_HASH_RE = /^[0-9a-f]{64}$/;

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

/**
 * Stateful page fake. Before the action: returns "before" content.
 * After the action method fires (goto/click/fill/evaluate): returns "after".
 * This lets us verify that before_hash !== after_hash.
 */
function makePage(overrides = {}) {
  let actionDone = false;
  const page = {
    url: () => (actionDone ? "https://example.com/after" : "https://example.com"),
    title: async () => (actionDone ? "After Page" : "Before Page"),
    screenshot: async () =>
      Buffer.from(actionDone ? "screenshot-after-bytes" : "screenshot-before-bytes"),
    content: async () =>
      actionDone
        ? "<html><body>after-state</body></html>"
        : "<html><body>before-state</body></html>",
    goto: async (_url) => {
      actionDone = true;
      return null;
    },
    click: async (_selector) => {
      actionDone = true;
    },
    fill: async (_selector, _value) => {
      actionDone = true;
    },
    locator: (_selector) => ({
      textContent: async () => "Element Text",
      evaluate: async (_fn) => {
        actionDone = true;
      },
    }),
  };
  return Object.assign(page, overrides);
}

/**
 * Static page fake — all calls return the same values. Use when you only need
 * to verify that some field was set without caring about before/after.
 */
function makeStaticPage(overrides = {}) {
  return Object.assign(
    {
      url: () => "https://example.com",
      title: async () => "Test Page",
      screenshot: async () => Buffer.from("static-screenshot"),
      content: async () => "<html></html>",
      goto: async () => null,
      click: async () => undefined,
      fill: async () => undefined,
      locator: () => ({
        textContent: async () => "Static Text",
        evaluate: async () => undefined,
      }),
    },
    overrides
  );
}

function makeShieldAgent(captureRef) {
  const record = (method) =>
    async (sessionId, params) => {
      if (!captureRef.calls) captureRef.calls = [];
      captureRef.calls.push({ method, sessionId, params: { ...params } });
      captureRef.lastCall = { method, sessionId, params: { ...params } };
      return { id: "evt_test", sequence: 1, hash: "h", created_at: "now" };
    };
  return {
    actionNavigated: record("actionNavigated"),
    actionClicked: record("actionClicked"),
    actionSubmitted: record("actionSubmitted"),
    actionPaymentConfirmed: record("actionPaymentConfirmed"),
  };
}

function makeAdapter(captureRef, config = {}) {
  return createShieldPlaywrightAdapter({
    shield: { agent: makeShieldAgent(captureRef) },
    sessionId: "ses_123",
    agentId: "agt-test",
    ...config,
  });
}

// ---------------------------------------------------------------------------
// navigate()
// ---------------------------------------------------------------------------

test("navigate calls actionNavigated", async () => {
  const cap = {};
  const adapter = makeAdapter(cap);
  await adapter.navigate(makePage(), "https://example.com/checkout");
  assert.strictEqual(cap.lastCall.method, "actionNavigated");
});

test("navigate sets target_url to the provided URL", async () => {
  const cap = {};
  const adapter = makeAdapter(cap);
  await adapter.navigate(makePage(), "https://example.com/checkout");
  assert.strictEqual(cap.lastCall.params.target_url, "https://example.com/checkout");
});

test("navigate result is success on successful navigation", async () => {
  const cap = {};
  const adapter = makeAdapter(cap);
  await adapter.navigate(makePage(), "https://example.com");
  assert.strictEqual(cap.lastCall.params.result, "success");
});

test("navigate screenshot_before_hash is 64-char lowercase hex", async () => {
  const cap = {};
  const adapter = makeAdapter(cap);
  await adapter.navigate(makePage(), "https://example.com");
  assert.match(cap.lastCall.params.screenshot_before_hash, VALID_HASH_RE);
});

test("navigate screenshot_after_hash is 64-char lowercase hex", async () => {
  const cap = {};
  const adapter = makeAdapter(cap);
  await adapter.navigate(makePage(), "https://example.com");
  assert.match(cap.lastCall.params.screenshot_after_hash, VALID_HASH_RE);
});

test("navigate dom_before_hash is 64-char lowercase hex", async () => {
  const cap = {};
  const adapter = makeAdapter(cap);
  await adapter.navigate(makePage(), "https://example.com");
  assert.match(cap.lastCall.params.dom_before_hash, VALID_HASH_RE);
});

test("navigate dom_after_hash is 64-char lowercase hex", async () => {
  const cap = {};
  const adapter = makeAdapter(cap);
  await adapter.navigate(makePage(), "https://example.com");
  assert.match(cap.lastCall.params.dom_after_hash, VALID_HASH_RE);
});

test("navigate before/after hashes differ when page changes", async () => {
  const cap = {};
  const adapter = makeAdapter(cap);
  await adapter.navigate(makePage(), "https://example.com");
  assert.notStrictEqual(
    cap.lastCall.params.screenshot_before_hash,
    cap.lastCall.params.screenshot_after_hash,
    "before and after screenshot hashes must differ when page content changes"
  );
  assert.notStrictEqual(
    cap.lastCall.params.dom_before_hash,
    cap.lastCall.params.dom_after_hash,
    "before and after DOM hashes must differ when page content changes"
  );
});

test("navigate no sha256: prefix in any hash field", async () => {
  const cap = {};
  const adapter = makeAdapter(cap);
  await adapter.navigate(makePage(), "https://example.com");
  for (const field of [
    "screenshot_before_hash",
    "screenshot_after_hash",
    "dom_before_hash",
    "dom_after_hash",
  ]) {
    const val = cap.lastCall.params[field];
    if (val !== undefined) {
      assert.ok(!val.startsWith("sha256:"), `${field} must not have sha256: prefix`);
    }
  }
});

test("navigate browser failure logs result: error and rethrows", async () => {
  const cap = {};
  const adapter = makeAdapter(cap);
  const page = makePage({
    goto: async () => {
      throw new Error("network timeout");
    },
  });
  await assert.rejects(
    () => adapter.navigate(page, "https://example.com"),
    (err) => {
      assert.strictEqual(err.message, "network timeout");
      return true;
    }
  );
  assert.strictEqual(cap.lastCall.params.result, "error");
});

// ---------------------------------------------------------------------------
// click()
// ---------------------------------------------------------------------------

test("click calls actionClicked", async () => {
  const cap = {};
  const adapter = makeAdapter(cap);
  await adapter.click(makePage(), "button#submit");
  assert.strictEqual(cap.lastCall.method, "actionClicked");
});

test("click sets element_selector", async () => {
  const cap = {};
  const adapter = makeAdapter(cap);
  await adapter.click(makePage(), "button#submit");
  assert.strictEqual(cap.lastCall.params.element_selector, "button#submit");
});

test("click captures element_text from locator", async () => {
  const cap = {};
  const adapter = makeAdapter(cap);
  await adapter.click(makePage(), "button#submit");
  assert.strictEqual(cap.lastCall.params.element_text, "Element Text");
});

test("click result is success on successful click", async () => {
  const cap = {};
  const adapter = makeAdapter(cap);
  await adapter.click(makePage(), "button#submit");
  assert.strictEqual(cap.lastCall.params.result, "success");
});

test("click browser failure logs result: error and rethrows", async () => {
  const cap = {};
  const adapter = makeAdapter(cap);
  const page = makePage({
    click: async () => {
      throw new Error("element not found");
    },
  });
  await assert.rejects(
    () => adapter.click(page, "button#missing"),
    (err) => {
      assert.strictEqual(err.message, "element not found");
      return true;
    }
  );
  assert.strictEqual(cap.lastCall.params.result, "error");
});

// ---------------------------------------------------------------------------
// fill()
// ---------------------------------------------------------------------------

test("fill calls actionSubmitted with action_type input_filled", async () => {
  const cap = {};
  const adapter = makeAdapter(cap);
  await adapter.fill(makePage(), "input[name='email']", "alice@example.com");
  assert.strictEqual(cap.lastCall.method, "actionSubmitted");
  assert.strictEqual(cap.lastCall.params.action_type, "input_filled");
});

test("fill does not send raw value to Shield", async () => {
  const cap = {};
  const adapter = makeAdapter(cap);
  await adapter.fill(makePage(), "input[name='secret']", "do-not-send-this-value");
  const body = JSON.stringify(cap.lastCall.params);
  assert.ok(
    !body.includes("do-not-send-this-value"),
    "raw fill value must never appear in Shield payload"
  );
  assert.strictEqual(cap.lastCall.params.value, undefined);
  assert.strictEqual(cap.lastCall.params.element_value, undefined);
});

test("fill sets element_selector", async () => {
  const cap = {};
  const adapter = makeAdapter(cap);
  await adapter.fill(makePage(), "input[name='email']", "alice@example.com");
  assert.strictEqual(cap.lastCall.params.element_selector, "input[name='email']");
});

test("fill result is success on successful fill", async () => {
  const cap = {};
  const adapter = makeAdapter(cap);
  await adapter.fill(makePage(), "input[name='email']", "x@example.com");
  assert.strictEqual(cap.lastCall.params.result, "success");
});

test("fill browser failure logs result: error and rethrows", async () => {
  const cap = {};
  const adapter = makeAdapter(cap);
  const page = makePage({
    fill: async () => {
      throw new Error("field locked");
    },
  });
  await assert.rejects(
    () => adapter.fill(page, "input[name='x']", "value"),
    (err) => {
      assert.strictEqual(err.message, "field locked");
      return true;
    }
  );
  assert.strictEqual(cap.lastCall.params.result, "error");
});

// ---------------------------------------------------------------------------
// submit()
// ---------------------------------------------------------------------------

test("submit calls actionSubmitted with action_type submitted", async () => {
  const cap = {};
  const adapter = makeAdapter(cap);
  await adapter.submit(makePage(), "form#checkout");
  assert.strictEqual(cap.lastCall.method, "actionSubmitted");
  assert.strictEqual(cap.lastCall.params.action_type, "submitted");
});

test("submit sets element_selector", async () => {
  const cap = {};
  const adapter = makeAdapter(cap);
  await adapter.submit(makePage(), "form#checkout");
  assert.strictEqual(cap.lastCall.params.element_selector, "form#checkout");
});

test("submit result is success on successful submit", async () => {
  const cap = {};
  const adapter = makeAdapter(cap);
  await adapter.submit(makePage(), "form#checkout");
  assert.strictEqual(cap.lastCall.params.result, "success");
});

test("submit browser failure logs result: error and rethrows", async () => {
  const cap = {};
  const adapter = makeAdapter(cap);
  const page = makePage({
    locator: (_selector) => ({
      textContent: async () => null,
      evaluate: async () => {
        throw new Error("form not found");
      },
    }),
  });
  await assert.rejects(
    () => adapter.submit(page, "form#missing"),
    (err) => {
      assert.strictEqual(err.message, "form not found");
      return true;
    }
  );
  assert.strictEqual(cap.lastCall.params.result, "error");
});

// ---------------------------------------------------------------------------
// confirmPayment()
// ---------------------------------------------------------------------------

test("confirmPayment calls actionPaymentConfirmed", async () => {
  const cap = {};
  const adapter = makeAdapter(cap);
  await adapter.confirmPayment(makePage(), "button#pay", {
    amount: 29900,
    currency: "USD",
    humanApprovalEventId: "evt_approval_123",
  });
  assert.strictEqual(cap.lastCall.method, "actionPaymentConfirmed");
});

test("confirmPayment sets amount and currency in params", async () => {
  const cap = {};
  const adapter = makeAdapter(cap);
  await adapter.confirmPayment(makePage(), "button#pay", {
    amount: 29900,
    currency: "USD",
    humanApprovalEventId: "evt_approval_123",
  });
  assert.strictEqual(cap.lastCall.params.amount, 29900);
  assert.strictEqual(cap.lastCall.params.currency, "USD");
});

test("confirmPayment passes humanApprovalEventId to Shield", async () => {
  const cap = {};
  const adapter = makeAdapter(cap);
  await adapter.confirmPayment(makePage(), "button#pay", {
    amount: 100,
    currency: "EUR",
    humanApprovalEventId: "evt_abc",
  });
  assert.strictEqual(cap.lastCall.params.human_approval_event_id, "evt_abc");
});

test("confirmPayment succeeds with payment scope instead of approval ID", async () => {
  const cap = {};
  const adapter = makeAdapter(cap, { authorityScope: ["pay:checkout"] });
  await adapter.confirmPayment(makePage(), "button#pay", {
    amount: 100,
    currency: "USD",
  });
  assert.strictEqual(cap.lastCall.params.result, "success");
});

test("confirmPayment throws ShieldError without amount", async () => {
  const cap = {};
  const adapter = makeAdapter(cap);
  await assert.rejects(
    () =>
      adapter.confirmPayment(makePage(), "button#pay", {
        amount: undefined,
        currency: "USD",
        humanApprovalEventId: "evt_abc",
      }),
    (err) => {
      assert.ok(err instanceof ShieldError);
      assert.match(err.message, /amount/);
      return true;
    }
  );
});

test("confirmPayment throws ShieldError without currency", async () => {
  const cap = {};
  const adapter = makeAdapter(cap);
  await assert.rejects(
    () =>
      adapter.confirmPayment(makePage(), "button#pay", {
        amount: 100,
        currency: "",
        humanApprovalEventId: "evt_abc",
      }),
    (err) => {
      assert.ok(err instanceof ShieldError);
      assert.match(err.message, /currency/);
      return true;
    }
  );
});

test("confirmPayment throws ShieldError without humanApprovalEventId or payment scope", async () => {
  const cap = {};
  const adapter = makeAdapter(cap, { authorityScope: ["read:files"] });
  await assert.rejects(
    () =>
      adapter.confirmPayment(makePage(), "button#pay", {
        amount: 100,
        currency: "USD",
      }),
    (err) => {
      assert.ok(err instanceof ShieldError);
      assert.match(err.message, /humanApprovalEventId/);
      return true;
    }
  );
});

// ---------------------------------------------------------------------------
// Cross-cutting: identity, error behavior, Shield failure modes
// ---------------------------------------------------------------------------

test("missing agent identity throws ShieldError at factory time", () => {
  assert.throws(
    () =>
      createShieldPlaywrightAdapter({
        shield: { agent: makeShieldAgent({}) },
        sessionId: "ses_123",
      }),
    (err) => {
      assert.ok(err instanceof ShieldError);
      assert.match(err.message, /agent_id or agent_name/);
      return true;
    }
  );
});

test("agentName alone is accepted and forwarded", async () => {
  const cap = {};
  const adapter = createShieldPlaywrightAdapter({
    shield: { agent: makeShieldAgent(cap) },
    sessionId: "ses_123",
    agentName: "gpt-4o",
  });
  await adapter.navigate(makeStaticPage(), "https://example.com");
  assert.strictEqual(cap.lastCall.params.agent_name, "gpt-4o");
  assert.strictEqual(cap.lastCall.params.agent_id, undefined);
});

test("Shield logging failure is swallowed by default (navigate)", async () => {
  const shield = {
    agent: {
      actionNavigated: async () => {
        throw new Error("shield down");
      },
      actionClicked: async () => {},
      actionSubmitted: async () => {},
      actionPaymentConfirmed: async () => {},
    },
  };
  const adapter = createShieldPlaywrightAdapter({
    shield,
    sessionId: "ses_123",
    agentId: "agt-1",
  });
  await adapter.navigate(makeStaticPage(), "https://example.com");
});

test("Shield logging failure rethrows when throwOnShieldError is true (navigate)", async () => {
  const shield = {
    agent: {
      actionNavigated: async () => {
        throw new Error("shield down");
      },
      actionClicked: async () => {},
      actionSubmitted: async () => {},
      actionPaymentConfirmed: async () => {},
    },
  };
  const adapter = createShieldPlaywrightAdapter({
    shield,
    sessionId: "ses_123",
    agentId: "agt-1",
    throwOnShieldError: true,
  });
  await assert.rejects(
    () => adapter.navigate(makeStaticPage(), "https://example.com"),
    (err) => {
      assert.strictEqual(err.message, "shield down");
      return true;
    }
  );
});

test("Shield logging failure is swallowed by default (fill)", async () => {
  const shield = {
    agent: {
      actionNavigated: async () => {},
      actionClicked: async () => {},
      actionSubmitted: async () => {
        throw new Error("shield down");
      },
      actionPaymentConfirmed: async () => {},
    },
  };
  const adapter = createShieldPlaywrightAdapter({
    shield,
    sessionId: "ses_123",
    agentId: "agt-1",
  });
  await adapter.fill(makeStaticPage(), "input[name='x']", "value");
});

test("raw screenshot bytes are never in Shield payload", async () => {
  const cap = {};
  const adapter = makeAdapter(cap);
  await adapter.navigate(makeStaticPage(), "https://example.com");
  const body = JSON.stringify(cap.lastCall.params);
  assert.ok(
    !body.includes("c3RhdGljLXNjcmVlbnNob3Q="),
    "raw screenshot bytes must not appear as base64"
  );
  // The only screenshot-related keys must be *_hash fields (64-char hex strings)
  assert.ok(
    !/"screenshot_before"\s*:/.test(body),
    "raw screenshot must not be a plain field"
  );
});

test("raw DOM content is never in Shield payload", async () => {
  const cap = {};
  const adapter = makeAdapter(cap);
  await adapter.navigate(makeStaticPage(), "https://example.com");
  const body = JSON.stringify(cap.lastCall.params);
  assert.ok(!body.includes("<html>"), "raw DOM content must not appear in Shield payload");
  assert.ok(
    !/"dom_before"\s*:\s*"</.test(body),
    "raw DOM content must not be a plain string field"
  );
});

test("no Playwright package required — test runs without playwright installed", () => {
  // If we reach this line, the module loaded with zero playwright import.
  assert.ok(typeof createShieldPlaywrightAdapter === "function");
});
