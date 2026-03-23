import type { Page } from "playwright";
import type { AutomationAction } from "./types";
import { captureRunScreenshot, recordRunEvent } from "./replayRecorder";
import { requestApproval, waitForApproval } from "./approvalGate";
import { resolveSelector } from "./selectorHealing";
import { handleVisualFallback } from "./visualFallback";
import { evaluateAutomationPolicy } from "./policyEngine";

export async function runAutomationAction(input: {
  runId: string;
  stepIndex: number;
  action: AutomationAction;
  payload: Record<string, any>;
  page: Page;
  startedBy?: string;
  templateKey?: string;
}) {
  const { runId, stepIndex, action, payload, page, startedBy, templateKey = "unknown" } = input;

  await recordRunEvent({
    runId,
    eventType: "action.started",
    stepIndex,
    actionName: action.name,
    payload: action,
  });

  const policy = evaluateAutomationPolicy({ templateKey, action, payload });

  if (!policy.allowed) {
    throw new Error(policy.reason || `Policy blocked action ${action.name}`);
  }

  if (policy.requiresApproval && action.type !== "humanApproval") {
    const checkpoint = action.checkpointName || `policy-${action.name}`;
    await requestApproval(runId, checkpoint, startedBy);
    const decision = await waitForApproval(runId, checkpoint);
    if (!decision.approved) {
      throw new Error(`Policy approval denied: ${decision.reason || checkpoint}`);
    }
  }

  switch (action.type) {
    case "goto": {
      if (!action.url) throw new Error(`Action ${action.name} missing url`);
      await page.goto(action.url, { waitUntil: "networkidle" });
      break;
    }

    case "fill": {
      if (!action.selector || !action.valueKey) {
        throw new Error(`Action ${action.name} missing selector or valueKey`);
      }
      const value = payload[action.valueKey];
      if (value != null) {
        try {
          const resolved = await resolveSelector(page, action.selector);
          await page.fill(resolved, String(value));
        } catch (err: any) {
          await handleVisualFallback({ runId, page, stepIndex, actionName: action.name, reason: err?.message || "fill failed" });
          throw err;
        }
      }
      break;
    }

    case "select": {
      if (!action.selector || !action.valueKey) {
        throw new Error(`Action ${action.name} missing selector or valueKey`);
      }
      const value = payload[action.valueKey];
      if (value != null) {
        try {
          const resolved = await resolveSelector(page, action.selector);
          await page.selectOption(resolved, String(value));
        } catch (err: any) {
          await handleVisualFallback({ runId, page, stepIndex, actionName: action.name, reason: err?.message || "select failed" });
          throw err;
        }
      }
      break;
    }

    case "check": {
      if (!action.selector || !action.valueKey) {
        throw new Error(`Action ${action.name} missing selector or valueKey`);
      }
      const value = Boolean(payload[action.valueKey]);
      if (value) {
        try {
          const resolved = await resolveSelector(page, action.selector);
          await page.check(resolved);
        } catch (err: any) {
          await handleVisualFallback({ runId, page, stepIndex, actionName: action.name, reason: err?.message || "check failed" });
          throw err;
        }
      }
      break;
    }

    case "click": {
      if (!action.selector) throw new Error(`Action ${action.name} missing selector`);
      try {
        const resolved = await resolveSelector(page, action.selector);
        await page.click(resolved);
      } catch (err: any) {
        await handleVisualFallback({ runId, page, stepIndex, actionName: action.name, reason: err?.message || "click failed" });
        throw err;
      }
      break;
    }

    case "waitFor": {
      if (!action.selector) throw new Error(`Action ${action.name} missing selector`);
      try {
        const resolved = await resolveSelector(page, action.selector);
        await page.waitForSelector(resolved, { timeout: action.timeoutMs || 10000 });
      } catch (err: any) {
        await handleVisualFallback({ runId, page, stepIndex, actionName: action.name, reason: err?.message || "waitFor failed" });
        throw err;
      }
      break;
    }

    case "assertVisible": {
      if (!action.selector) throw new Error(`Action ${action.name} missing selector`);
      try {
        const resolved = await resolveSelector(page, action.selector);
        await page.waitForSelector(resolved, { state: "visible", timeout: action.timeoutMs || 5000 });
      } catch (err: any) {
        await handleVisualFallback({ runId, page, stepIndex, actionName: action.name, reason: err?.message || "assertVisible failed" });
        throw err;
      }
      break;
    }

    case "extractText": {
      if (!action.selector) throw new Error(`Action ${action.name} missing selector`);
      try {
        const resolved = await resolveSelector(page, action.selector);
        const text = await page.textContent(resolved);
        await recordRunEvent({
          runId,
          eventType: "action.extracted_text",
          stepIndex,
          actionName: action.name,
          payload: { text: text?.trim() || "" },
        });
      } catch (err: any) {
        await handleVisualFallback({ runId, page, stepIndex, actionName: action.name, reason: err?.message || "extractText failed" });
        throw err;
      }
      break;
    }

    case "screenshot": {
      const shot = await captureRunScreenshot(runId, page, action.screenshotLabel || action.name);
      await recordRunEvent({
        runId,
        eventType: "action.screenshot",
        stepIndex,
        actionName: action.name,
        screenshotKey: shot.fileName,
      });
      break;
    }

    case "humanApproval": {
      const checkpointName = action.checkpointName || action.name;
      await requestApproval(runId, checkpointName, startedBy);
      const decision = await waitForApproval(runId, checkpointName);
      if (!decision.approved) {
        throw new Error(`Approval denied or timed out: ${decision.reason || checkpointName}`);
      }
      break;
    }

    default:
      throw new Error(`Unsupported automation action: ${String((action as any).type)}`);
  }

  await recordRunEvent({
    runId,
    eventType: "action.completed",
    stepIndex,
    actionName: action.name,
  });
}
