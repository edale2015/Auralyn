/**
 * Template Validation Worker — background job that validates all registered
 * templates and logs a structured health report.
 *
 * Designed to be called from:
 *   - A cron job (nightly, hourly, etc.)
 *   - An admin API endpoint (on-demand scan)
 *   - The autonomous repair agent before deciding what to fix
 *
 * The worker launches ONE shared browser, runs each template sequentially
 * (to avoid concurrent page-load conflicts on external URLs), then closes
 * the browser. Each template gets its own fresh page inside `validateTemplate`.
 */

import { chromium } from "playwright";
import { listAutomationTemplates } from "./templateRegistry";
import { listStoredTemplates }      from "./templateStore";
import { validateTemplate }         from "./templateValidator";
import type { TemplateValidationReport } from "./templateValidator";
import type { AutomationTemplate }       from "./types";

export interface ValidationWorkerReport {
  startedAt:  string;
  finishedAt: string;
  total:      number;
  passed:     number;
  failed:     number;
  results:    TemplateValidationReport[];
}

/**
 * Run validation against the built-in registry templates.
 * Does not need a DB connection.
 */
export async function runRegistryValidation(): Promise<ValidationWorkerReport> {
  return runValidationWorker(listAutomationTemplates());
}

/**
 * Run validation against all templates stored in the DB.
 * Falls back to the registry if the DB has no templates.
 */
export async function runStoredValidation(): Promise<ValidationWorkerReport> {
  const rows = await listStoredTemplates();
  const templates: AutomationTemplate[] = rows.length > 0
    ? rows.map((r: any) => r.definition as AutomationTemplate)
    : listAutomationTemplates();
  return runValidationWorker(templates);
}

/**
 * Core worker — launch browser, validate all templates, close browser.
 */
export async function runValidationWorker(
  templates: AutomationTemplate[]
): Promise<ValidationWorkerReport> {
  const startedAt = new Date().toISOString();
  const results: TemplateValidationReport[] = [];

  const browser = await chromium.launch({ headless: true });
  try {
    for (const template of templates) {
      console.log(`[validationWorker] Checking template: ${template.templateKey}`);
      try {
        const report = await validateTemplate(browser, template);
        results.push(report);
        console.log(
          `[validationWorker] ${template.templateKey}: ${report.ok ? "OK" : `BROKEN (${report.issues.length} issues)`}`
        );
      } catch (err: any) {
        results.push({
          templateKey: template.templateKey,
          name:        template.name,
          startUrl:    template.startUrl,
          ok:          false,
          issues:      [{ step: -1, name: "worker-error", type: "unknown", selector: undefined, found: false, error: err?.message }],
          checkedAt:   new Date().toISOString(),
        });
      }
    }
  } finally {
    await browser.close();
  }

  const finishedAt = new Date().toISOString();
  return {
    startedAt,
    finishedAt,
    total:  results.length,
    passed: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
}
