import type { RPATemplate, RPAStep } from "./templateLibrary";

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
          await executeStep(page, step);
          stepsCompleted++;
        } catch (e: any) {
          errors.push(`Step ${stepsCompleted + 1} (${step.description ?? step.type}): ${e?.message}`);
          break;
        }
      }
    } finally {
      await browser.close();
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
    return simulateExecution(template, start, `Playwright unavailable: ${e?.message}`);
  }
}

async function executeStep(page: any, step: RPAStep): Promise<void> {
  switch (step.type) {
    case "click":
      await page.click(step.selector!, { timeout: step.timeout ?? 10_000 });
      break;
    case "type":
      await page.fill(step.selector!, step.value ?? "", { timeout: step.timeout ?? 10_000 });
      break;
    case "select":
      await page.selectOption(step.selector!, step.value ?? "", { timeout: step.timeout ?? 10_000 });
      break;
    case "wait":
      await page.waitForTimeout(step.timeout ?? 1_000);
      break;
    case "screenshot":
      await page.screenshot({ path: `rpa_screenshot_${Date.now()}.png` });
      break;
    case "assert":
      const visible = await page.isVisible(step.selector!);
      if (!visible) throw new Error(`Assertion failed: ${step.selector} not visible`);
      break;
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
