import type { RPATemplate, RPAStep } from "./templateLibrary";
import { emitEvent } from "../controlTower/eventBus";

export interface BrowserTaskInput {
  url: string;
  steps: RPAStep[];
  headless?: boolean;
}

export async function runBrowserTask(task: BrowserTaskInput): Promise<{ success: boolean; result?: string; error?: string; durationMs: number }> {
  const start = Date.now();
  try {
    const playwright = await import("playwright").catch(() => null);
    if (!playwright) {
      console.log(`[BrowserAgent] Simulating task at ${task.url} (${task.steps.length} steps)`);
      return { success: true, result: `Simulated: ${task.steps.length} steps at ${task.url}`, durationMs: Date.now() - start };
    }

    const browser = await playwright.chromium.launch({ headless: task.headless ?? true });
    const page = await browser.newPage();

    try {
      await page.goto(task.url, { waitUntil: "domcontentloaded", timeout: 30_000 });

      for (const step of task.steps) {
        const selectorExists = step.selector ? await page.isVisible(step.selector).catch(() => false) : true;

        if (step.selector && !selectorExists) {
          const errMsg = `Selector not found: "${step.selector}" (step: ${step.type})`;
          emitEvent({
            type: "RPA_FAILURE",
            payload: { url: task.url, selector: step.selector, stepType: step.type, error: errMsg },
            timestamp: Date.now(),
          });
          return { success: false, error: errMsg, durationMs: Date.now() - start };
        }

        if (step.type === "click") await page.click(step.selector!, { timeout: step.timeout ?? 10_000 });
        if (step.type === "type") await page.fill(step.selector!, step.value ?? "", { timeout: step.timeout ?? 10_000 });
        if (step.type === "select") await page.selectOption(step.selector!, step.value ?? "");
        if (step.type === "wait") await page.waitForTimeout(step.timeout ?? 1_000);
      }

      const result = await page.content();
      return { success: true, result: result.slice(0, 2000), durationMs: Date.now() - start };
    } finally {
      await browser.close();
    }
  } catch (err: any) {
    emitEvent({
      type: "RPA_FAILURE",
      payload: { url: task.url, error: err?.message },
      timestamp: Date.now(),
    });
    return { success: false, error: err?.message, durationMs: Date.now() - start };
  }
}

export interface RPAResult {
  success: boolean;
  stepsCompleted: number;
  stepsTotal: number;
  errors: string[];
  durationMs: number;
  screenshots: string[];
  output: Record<string, any>;
}

export interface BrowserTask {
  templateId?: string;
  template?: RPATemplate;
  variables?: Record<string, string>;
  headless?: boolean;
}

export async function runUIAutomation(task: BrowserTask): Promise<RPAResult> {
  const template = task.template;
  if (!template) {
    return {
      success: false,
      stepsCompleted: 0,
      stepsTotal: 0,
      errors: ["No template provided"],
      durationMs: 0,
      screenshots: [],
      output: {},
    };
  }

  const start = Date.now();
  const errors: string[] = [];
  const screenshots: string[] = [];
  let stepsCompleted = 0;

  try {
    const playwright = await import("playwright").catch(() => null);
    if (!playwright) {
      return simulateExecution(template, start);
    }

    const browser = await playwright.chromium.launch({ headless: task.headless ?? true });
    const page = await browser.newPage();

    try {
      await page.goto(template.url, { timeout: 30_000 });

      for (const step of template.steps) {
        try {
          await executeStep(page, step, template.url);
          stepsCompleted++;
        } catch (e: any) {
          const errMsg = `Step ${stepsCompleted + 1} (${step.description ?? step.type}): ${e?.message}`;
          errors.push(errMsg);

          if (e?.message?.includes("Selector not found")) {
            emitEvent({
              type: "RPA_FAILURE",
              payload: {
                templateId: template.id,
                templateName: template.name,
                url: template.url,
                step: step.description ?? step.type,
                selector: step.selector,
                error: e?.message,
              },
              timestamp: Date.now(),
            });
          }

          break;
        }
      }
    } finally {
      await browser.close();
    }

    if (errors.length > 0) {
      emitEvent({
        type: "RPA_FAILURE",
        payload: {
          templateId: template.id,
          templateName: template.name,
          stepsCompleted,
          stepsTotal: template.steps.length,
          errors,
        },
        timestamp: Date.now(),
      });
    }

    return {
      success: errors.length === 0,
      stepsCompleted,
      stepsTotal: template.steps.length,
      errors,
      durationMs: Date.now() - start,
      screenshots,
      output: {},
    };
  } catch (e: any) {
    emitEvent({
      type: "RPA_FAILURE",
      payload: { templateId: template.id, templateName: template.name, error: `Playwright unavailable: ${e?.message}` },
      timestamp: Date.now(),
    });
    return simulateExecution(template, start, `Playwright unavailable: ${e?.message}`);
  }
}

async function executeStep(page: any, step: RPAStep, url?: string): Promise<void> {
  switch (step.type) {
    case "click": {
      if (step.selector) {
        const visible = await page.isVisible(step.selector).catch(() => false);
        if (!visible) throw new Error(`Selector not found: "${step.selector}"`);
      }
      await page.click(step.selector!, { timeout: step.timeout ?? 10_000 });
      break;
    }
    case "type": {
      if (step.selector) {
        const visible = await page.isVisible(step.selector).catch(() => false);
        if (!visible) throw new Error(`Selector not found: "${step.selector}"`);
      }
      await page.fill(step.selector!, step.value ?? "", { timeout: step.timeout ?? 10_000 });
      break;
    }
    case "select":
      await page.selectOption(step.selector!, step.value ?? "", { timeout: step.timeout ?? 10_000 });
      break;
    case "wait":
      await page.waitForTimeout(step.timeout ?? 1_000);
      break;
    case "screenshot":
      await page.screenshot({ path: `rpa_screenshot_${Date.now()}.png` });
      break;
    case "assert": {
      const visible = await page.isVisible(step.selector!);
      if (!visible) throw new Error(`Assertion failed: ${step.selector} not visible`);
      break;
    }
  }
}

function simulateExecution(template: RPATemplate, start: number, note?: string): RPAResult {
  console.log(`[BrowserAgent] Simulating execution of template: ${template.name}${note ? ` (${note})` : ""}`);
  return {
    success: true,
    stepsCompleted: template.steps.length,
    stepsTotal: template.steps.length,
    errors: [],
    durationMs: Date.now() - start,
    screenshots: [],
    output: {
      simulated: true,
      templateId: template.id,
      note: note ?? "Playwright not installed — simulated execution",
    },
  };
}
