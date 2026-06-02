import * as crypto from "node:crypto";
import type { AgentEventParams, ActionEvidenceParams, ShieldEvent } from "../types";
import { ShieldError } from "../types";

// Minimal structural type for a Playwright-compatible Page object.
// Users pass a real playwright.Page — no playwright package import needed here.
export interface LocatorLike {
  textContent(options?: Record<string, unknown>): Promise<string | null>;
  evaluate<R>(fn: (element: unknown) => R | Promise<R>): Promise<R>;
}

export interface PageLike {
  url(): string;
  title(): Promise<string>;
  screenshot(options?: Record<string, unknown>): Promise<Buffer | Uint8Array>;
  content(): Promise<string>;
  goto(url: string, options?: Record<string, unknown>): Promise<unknown>;
  click(selector: string, options?: Record<string, unknown>): Promise<void>;
  fill(selector: string, value: string, options?: Record<string, unknown>): Promise<void>;
  locator(selector: string): LocatorLike;
}

// Alias to avoid repeating the intersection everywhere.
type AgentActionParams = Omit<AgentEventParams, "event_type"> & ActionEvidenceParams;

// Structural interface — accepts real ShieldClient.agent or a test mock.
interface ShieldAgentLike {
  actionNavigated(sessionId: string, params: AgentActionParams): Promise<ShieldEvent>;
  actionClicked(sessionId: string, params: AgentActionParams): Promise<ShieldEvent>;
  actionSubmitted(sessionId: string, params: AgentActionParams): Promise<ShieldEvent>;
  actionPaymentConfirmed(sessionId: string, params: AgentActionParams): Promise<ShieldEvent>;
}

interface ShieldLike {
  agent: ShieldAgentLike;
}

export interface ShieldPlaywrightAdapterConfig {
  shield: ShieldLike;
  sessionId: string;
  /** At least one of agentId or agentName is required. */
  agentId?: string;
  agentName?: string;
  agentProvider?: string;
  principalUserId?: string;
  authorityScope?: string[];
  browserSessionId?: string;
  /** Actor identifier sent to the backend. Defaults to agentId ?? agentName ?? "agent". */
  actor?: string;
  /**
   * If true, Shield logging failures are re-thrown instead of swallowed. Default: false.
   * Note: if the browser action also throws, the Shield error takes precedence.
   */
  throwOnShieldError?: boolean;
}

export interface NavigateOptions {
  authorityScope?: string[];
}

export interface ClickOptions {
  riskLevel?: string;
  amount?: number;
  currency?: string;
  humanApprovalEventId?: string;
  authorityScope?: string[];
}

export interface FillOptions {
  authorityScope?: string[];
}

export interface SubmitOptions {
  authorityScope?: string[];
}

export interface ConfirmPaymentOptions {
  /** Required. Numeric amount (e.g. 29900 for $299.00 in cents, or 299.0 in decimal). */
  amount: number;
  /** Required. ISO 4217 currency code (e.g. "USD"). */
  currency: string;
  humanApprovalEventId?: string;
  authorityScope?: string[];
  riskLevel?: string;
}

interface PageEvidence {
  url: string;
  title: string;
  screenshotHash: string;
  domHash: string;
}

async function capturePageEvidence(page: PageLike): Promise<PageEvidence> {
  const url = page.url();
  const [title, screenshotBytes, domContent] = await Promise.all([
    page.title(),
    page.screenshot(),
    page.content(),
  ]);
  const screenshotHash = crypto.createHash("sha256").update(screenshotBytes).digest("hex");
  const domHash = crypto.createHash("sha256").update(domContent).digest("hex");
  return { url, title, screenshotHash, domHash };
}

async function tryGetElementText(page: PageLike, selector: string): Promise<string | undefined> {
  try {
    const text = await page.locator(selector).textContent();
    return text ?? undefined;
  } catch {
    return undefined;
  }
}

export function createShieldPlaywrightAdapter(config: ShieldPlaywrightAdapterConfig) {
  const {
    shield,
    sessionId,
    agentId,
    agentName,
    agentProvider,
    principalUserId,
    authorityScope: configScope,
    browserSessionId,
    throwOnShieldError = false,
  } = config;
  const effectiveActor = config.actor ?? agentId ?? agentName ?? "agent";

  if (!agentId && !agentName) {
    throw new ShieldError(0, "agent_id or agent_name is required for Playwright adapter");
  }

  function identityParams(overrideScope?: string[]) {
    return {
      actor: effectiveActor,
      agent_id: agentId,
      agent_name: agentName,
      agent_provider: agentProvider,
      principal_user_id: principalUserId,
      authority_scope: overrideScope ?? configScope,
    };
  }

  async function logOrSwallow(fn: () => Promise<ShieldEvent>, label: string): Promise<void> {
    try {
      await fn();
    } catch (shieldErr) {
      if (throwOnShieldError) throw shieldErr;
      console.error(`[Shield Playwright Adapter] Failed to log ${label}:`, shieldErr);
    }
  }

  async function navigate(
    page: PageLike,
    url: string,
    options: NavigateOptions = {}
  ): Promise<void> {
    const scope = options.authorityScope ?? configScope;
    const before = await capturePageEvidence(page);

    try {
      await page.goto(url);
    } catch (err) {
      const errorMessage = (err instanceof Error ? err.message : String(err)).slice(0, 500);
      await logOrSwallow(
        () =>
          shield.agent.actionNavigated(sessionId, {
            ...identityParams(scope),
            browser_session_id: browserSessionId,
            action_type: "navigate",
            target_url: url,
            page_title: before.title,
            screenshot_before_hash: before.screenshotHash,
            dom_before_hash: before.domHash,
            result: "error",
            data: { error_message: errorMessage },
          }),
        "navigate error"
      );
      throw err;
    }

    const after = await capturePageEvidence(page);
    await logOrSwallow(
      () =>
        shield.agent.actionNavigated(sessionId, {
          ...identityParams(scope),
          browser_session_id: browserSessionId,
          action_type: "navigate",
          target_url: url,
          page_title: after.title,
          screenshot_before_hash: before.screenshotHash,
          screenshot_after_hash: after.screenshotHash,
          dom_before_hash: before.domHash,
          dom_after_hash: after.domHash,
          result: "success",
        }),
      "navigate"
    );
  }

  async function click(
    page: PageLike,
    selector: string,
    options: ClickOptions = {}
  ): Promise<void> {
    const scope = options.authorityScope ?? configScope;
    const before = await capturePageEvidence(page);
    const elementText = await tryGetElementText(page, selector);

    try {
      await page.click(selector);
    } catch (err) {
      const errorMessage = (err instanceof Error ? err.message : String(err)).slice(0, 500);
      await logOrSwallow(
        () =>
          shield.agent.actionClicked(sessionId, {
            ...identityParams(scope),
            browser_session_id: browserSessionId,
            action_type: "click",
            element_selector: selector,
            element_text: elementText,
            page_title: before.title,
            screenshot_before_hash: before.screenshotHash,
            dom_before_hash: before.domHash,
            result: "error",
            data: { error_message: errorMessage },
          }),
        "click error"
      );
      throw err;
    }

    const after = await capturePageEvidence(page);
    await logOrSwallow(
      () =>
        shield.agent.actionClicked(sessionId, {
          ...identityParams(scope),
          browser_session_id: browserSessionId,
          action_type: "click",
          element_selector: selector,
          element_text: elementText,
          page_title: after.title,
          screenshot_before_hash: before.screenshotHash,
          screenshot_after_hash: after.screenshotHash,
          dom_before_hash: before.domHash,
          dom_after_hash: after.domHash,
          risk_level: options.riskLevel,
          result: "success",
        }),
      "click"
    );
  }

  async function fill(
    page: PageLike,
    selector: string,
    value: string,
    options: FillOptions = {}
  ): Promise<void> {
    const scope = options.authorityScope ?? configScope;
    const before = await capturePageEvidence(page);

    // Raw value is NEVER passed to Shield — element_selector identifies the field only.
    try {
      await page.fill(selector, value);
    } catch (err) {
      const errorMessage = (err instanceof Error ? err.message : String(err)).slice(0, 500);
      await logOrSwallow(
        () =>
          shield.agent.actionSubmitted(sessionId, {
            ...identityParams(scope),
            browser_session_id: browserSessionId,
            action_type: "input_filled",
            element_selector: selector,
            page_title: before.title,
            screenshot_before_hash: before.screenshotHash,
            dom_before_hash: before.domHash,
            result: "error",
            data: { error_message: errorMessage },
          }),
        "fill error"
      );
      throw err;
    }

    const after = await capturePageEvidence(page);
    await logOrSwallow(
      () =>
        shield.agent.actionSubmitted(sessionId, {
          ...identityParams(scope),
          browser_session_id: browserSessionId,
          action_type: "input_filled",
          element_selector: selector,
          page_title: after.title,
          screenshot_before_hash: before.screenshotHash,
          screenshot_after_hash: after.screenshotHash,
          dom_before_hash: before.domHash,
          dom_after_hash: after.domHash,
          result: "success",
        }),
      "fill"
    );
  }

  async function submit(
    page: PageLike,
    selector: string,
    options: SubmitOptions = {}
  ): Promise<void> {
    const scope = options.authorityScope ?? configScope;
    const before = await capturePageEvidence(page);

    try {
      await page.locator(selector).evaluate((el) => {
        // el is unknown (no DOM lib in tsconfig) — cast to access form/element methods.
        const form = el as {
          requestSubmit?: () => void;
          submit?: () => void;
          click?: () => void;
        };
        if (form.requestSubmit) {
          form.requestSubmit();
        } else if (form.submit) {
          form.submit();
        } else if (form.click) {
          form.click();
        }
      });
    } catch (err) {
      const errorMessage = (err instanceof Error ? err.message : String(err)).slice(0, 500);
      await logOrSwallow(
        () =>
          shield.agent.actionSubmitted(sessionId, {
            ...identityParams(scope),
            browser_session_id: browserSessionId,
            action_type: "submitted",
            element_selector: selector,
            page_title: before.title,
            screenshot_before_hash: before.screenshotHash,
            dom_before_hash: before.domHash,
            result: "error",
            data: { error_message: errorMessage },
          }),
        "submit error"
      );
      throw err;
    }

    const after = await capturePageEvidence(page);
    await logOrSwallow(
      () =>
        shield.agent.actionSubmitted(sessionId, {
          ...identityParams(scope),
          browser_session_id: browserSessionId,
          action_type: "submitted",
          element_selector: selector,
          page_title: after.title,
          screenshot_before_hash: before.screenshotHash,
          screenshot_after_hash: after.screenshotHash,
          dom_before_hash: before.domHash,
          dom_after_hash: after.domHash,
          result: "success",
        }),
      "submit"
    );
  }

  async function confirmPayment(
    page: PageLike,
    selector: string,
    options: ConfirmPaymentOptions
  ): Promise<void> {
    const { amount, currency, humanApprovalEventId, riskLevel } = options;
    const scope = options.authorityScope ?? configScope;

    // Payment gate — enforce before any browser action.
    if (amount === undefined || amount === null) {
      throw new ShieldError(0, "confirmPayment requires amount");
    }
    if (!currency) {
      throw new ShieldError(0, "confirmPayment requires currency");
    }
    const hasApproval = !!humanApprovalEventId;
    const hasPaymentScope = (scope ?? []).some(
      (s) => s.includes("payment") || s.includes("pay")
    );
    if (!hasApproval && !hasPaymentScope) {
      throw new ShieldError(
        0,
        "confirmPayment requires humanApprovalEventId or an authority scope containing 'payment' or 'pay'"
      );
    }

    const before = await capturePageEvidence(page);
    const elementText = await tryGetElementText(page, selector);

    try {
      await page.click(selector);
    } catch (err) {
      const errorMessage = (err instanceof Error ? err.message : String(err)).slice(0, 500);
      await logOrSwallow(
        () =>
          shield.agent.actionPaymentConfirmed(sessionId, {
            ...identityParams(scope),
            browser_session_id: browserSessionId,
            human_approval_event_id: humanApprovalEventId,
            action_type: "payment_confirmed",
            element_selector: selector,
            element_text: elementText,
            page_title: before.title,
            amount,
            currency,
            risk_level: riskLevel,
            screenshot_before_hash: before.screenshotHash,
            dom_before_hash: before.domHash,
            result: "error",
            data: { error_message: errorMessage },
          }),
        "confirmPayment error"
      );
      throw err;
    }

    const after = await capturePageEvidence(page);
    await logOrSwallow(
      () =>
        shield.agent.actionPaymentConfirmed(sessionId, {
          ...identityParams(scope),
          browser_session_id: browserSessionId,
          human_approval_event_id: humanApprovalEventId,
          action_type: "payment_confirmed",
          element_selector: selector,
          element_text: elementText,
          page_title: after.title,
          amount,
          currency,
          risk_level: riskLevel,
          screenshot_before_hash: before.screenshotHash,
          screenshot_after_hash: after.screenshotHash,
          dom_before_hash: before.domHash,
          dom_after_hash: after.domHash,
          result: "success",
        }),
      "confirmPayment"
    );
  }

  return { navigate, click, fill, submit, confirmPayment };
}
