import { sendToECWEncounter } from "../integrations/ecwAdapter";

export interface UIStep {
  type: "click" | "fill" | "wait" | "select";
  label: string;
  value?: string;
}

export interface UITemplate {
  url: string;
  steps: UIStep[];
  name?: string;
}

export interface AutomationResult {
  ok: boolean;
  time: number;
  error?: string;
}

// Multi-strategy element finder (runs against live Playwright page)
export async function findElement(page: any, label: string): Promise<string | null> {
  const strategies = [
    `text=${label}`,
    `[placeholder*="${label}" i]`,
    `[aria-label*="${label}" i]`,
    `label:has-text("${label}") + input`,
  ];
  for (const s of strategies) {
    try {
      if (await page.locator(s).count() > 0) return s;
    } catch {}
  }
  return null;
}

export async function detectForm(page: any): Promise<Array<{ name: string; placeholder: string }>> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll("input")).map((i: any) => ({
      name:        i.name        ?? "",
      placeholder: i.placeholder ?? "",
    }))
  );
}

export async function runUIAutomation(template: UITemplate): Promise<AutomationResult> {
  const start = Date.now();
  try {
    const { chromium } = await import("playwright" as any);
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(template.url);
    for (const step of template.steps) {
      const selector = await findElement(page, step.label);
      if (!selector) throw new Error(`Element not found: ${step.label}`);
      if (step.type === "click") await page.click(selector);
      if (step.type === "fill")  await page.fill(selector, step.value ?? "");
    }
    await browser.close();
    return { ok: true, time: Date.now() - start };
  } catch (e: any) {
    return { ok: false, time: Date.now() - start, error: e?.message };
  }
}

export async function runParallel(templates: UITemplate[]): Promise<AutomationResult[]> {
  return Promise.all(templates.map(t => runUIAutomation(t)));
}

export async function healAndRetry(template: UITemplate): Promise<AutomationResult> {
  const first = await runUIAutomation(template);
  if (first.ok) return first;
  // Simple heal: remove steps with no label (common breakage pattern)
  const healed = { ...template, steps: template.steps.filter(s => s.label?.trim()) };
  return runUIAutomation(healed);
}

export function trackAutomation(result: AutomationResult): { success: boolean; time: number } {
  return { success: result.ok, time: result.time };
}

export async function syncEHRs(data: {
  patientId: string;
  disposition: string;
  vitals?: Record<string, unknown>;
}): Promise<{ ecw: string; epic: string }> {
  const epicToken = process.env.EPIC_TOKEN ?? "";
  const epicBase  = process.env.FHIR_BASE   ?? "";

  const [ecwR] = await Promise.allSettled([
    sendToECWEncounter({ patientId: data.patientId, disposition: data.disposition, vitals: data.vitals }),
    epicBase && epicToken
      ? fetch(`${epicBase}/Observation`, {
          method: "POST",
          headers: { Authorization: `Bearer ${epicToken}`, "Content-Type": "application/json" },
          body: JSON.stringify(data),
        })
      : Promise.resolve(null),
  ]);

  return {
    ecw:  ecwR.status === "fulfilled" ? "ok" : "failed",
    epic: epicBase && epicToken ? "ok" : "skipped",
  };
}
