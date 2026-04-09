/**
 * Template Validator — standalone per-step validation function.
 *
 * Takes a live Playwright Browser, opens a fresh page, navigates to the
 * template's startUrl, and checks every action step that has a selector.
 * Uses a single page.evaluate() batch where possible; falls back to
 * locator().count() for Playwright-specific selectors.
 *
 * Returns a structured report, not exceptions — callers decide what to do
 * with broken templates.
 */

import type { Browser } from "playwright";
import type { AutomationTemplate, AutomationAction } from "./types";

export interface StepValidationResult {
  step:     number;
  name:     string;
  type:     string;
  selector: string | undefined;
  found:    boolean;
  error?:   string;
}

export interface TemplateValidationReport {
  templateKey: string;
  name:        string;
  startUrl:    string;
  ok:          boolean;
  issues:      StepValidationResult[];
  checkedAt:   string;
}

function isPlaywrightSelector(sel: string): boolean {
  return (
    sel.includes(":has-text(") ||
    sel.includes("nth=")       ||
    sel.startsWith("css=")     ||
    sel.startsWith("text=")
  );
}

export async function validateTemplate(
  browser: Browser,
  template: AutomationTemplate
): Promise<TemplateValidationReport> {
  const page = await browser.newPage();
  const issues: StepValidationResult[] = [];

  try {
    await page.goto(template.startUrl, { waitUntil: "domcontentloaded", timeout: 15_000 });

    // Partition steps into CSS-batchable and Playwright-only
    const stepsWithSelectors = template.actions
      .map((a, i) => ({ action: a, index: i }))
      .filter(({ action }) => !!action.selector);

    const cssBatch:  { action: AutomationAction; index: number }[] = [];
    const pwSingle:  { action: AutomationAction; index: number }[] = [];

    for (const item of stepsWithSelectors) {
      if (isPlaywrightSelector(item.action.selector!)) {
        pwSingle.push(item);
      } else {
        cssBatch.push(item);
      }
    }

    // ── Batch CSS check ──────────────────────────────────────────────────────
    if (cssBatch.length > 0) {
      let batchResults: boolean[] = cssBatch.map(() => false);
      try {
        batchResults = await page.evaluate(
          (selectors: string[]) =>
            selectors.map((s) => {
              try { return document.querySelector(s) !== null; }
              catch { return false; }
            }),
          cssBatch.map(({ action }) => action.selector!)
        );
      } catch {}

      for (let i = 0; i < cssBatch.length; i++) {
        const { action, index } = cssBatch[i];
        const found = batchResults[i] ?? false;
        if (!found) {
          issues.push({
            step:     index,
            name:     action.name,
            type:     action.type,
            selector: action.selector,
            found:    false,
            error:    "selector not found in DOM",
          });
        }
      }
    }

    // ── Playwright-specific selectors ────────────────────────────────────────
    for (const { action, index } of pwSingle) {
      try {
        const count = await page.locator(action.selector!).count();
        if (count === 0) {
          issues.push({
            step: index, name: action.name, type: action.type,
            selector: action.selector, found: false,
            error: "locator matched 0 elements",
          });
        }
      } catch (err: any) {
        issues.push({
          step: index, name: action.name, type: action.type,
          selector: action.selector, found: false,
          error: err?.message ?? "locator error",
        });
      }
    }
  } catch (navErr: any) {
    issues.push({
      step: -1, name: "navigate", type: "goto",
      selector: undefined, found: false,
      error: `Navigation failed: ${navErr?.message ?? "unknown"}`,
    });
  } finally {
    await page.close();
  }

  return {
    templateKey: template.templateKey,
    name:        template.name,
    startUrl:    template.startUrl,
    ok:          issues.length === 0,
    issues,
    checkedAt:   new Date().toISOString(),
  };
}
