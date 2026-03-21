import type { Page } from "playwright";
import type { AutomationAction } from "./types";
import { captureRunScreenshot, recordRunEvent } from "./replayRecorder";
import { requestApproval, waitForApproval } from "./approvalGate";

export async function runAutomationAction(input: {
  runId: string;
  stepIndex: number;
  action: AutomationAction;
  payload: Record<string, any>;
  page: Page;
  startedBy?: string;
}) {
  const { runId, stepIndex, action, payload, page, startedBy } = input;

  await recordRunEvent({
    runId,
    eventType: "action.started",
    stepIndex,
    actionName: action.name,
    payload: action,
  });

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
        await page.fill(action.selector, String(value));
      }
      break;
    }

    case "select": {
      if (!action.selector || !action.valueKey) {
        throw new Error(`Action ${action.name} missing selector or valueKey`);
      }
      const value = payload[action.valueKey];
      if (value != null) {
        await page.selectOption(action.selector, String(value));
      }
      break;
    }

    case "check": {
      if (!action.selector || !action.valueKey) {
        throw new Error(`Action ${action.name} missing selector or valueKey`);
      }
      const value = Boolean(payload[action.valueKey]);
      if (value) {
        await page.check(action.selector);
      }
      break;
    }

    case "click": {
      if (!action.selector) throw new Error(`Action ${action.name} missing selector`);
      await page.click(action.selector);
      break;
    }

    case "waitFor": {
      if (!action.selector) throw new Error(`Action ${action.name} missing selector`);
      await page.waitForSelector(action.selector, {
        timeout: action.timeoutMs || 10000,
      });
      break;
    }

    case "assertVisible": {
      if (!action.selector) throw new Error(`Action ${action.name} missing selector`);
      await page.waitForSelector(action.selector, {
        state: "visible",
        timeout: action.timeoutMs || 5000,
      });
      break;
    }

    case "extractText": {
      if (!action.selector) throw new Error(`Action ${action.name} missing selector`);
      const text = await page.textContent(action.selector);
      await recordRunEvent({
        runId,
        eventType: "action.extracted_text",
        stepIndex,
        actionName: action.name,
        payload: { text: text?.trim() || "" },
      });
      break;
    }

    case "screenshot": {
      const shot = await captureRunScreenshot(
        runId,
        page,
        action.screenshotLabel || action.name
      );
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
