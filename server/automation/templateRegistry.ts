/**
 * Template Registry — Packet 20 improvements
 *
 * Changes from baseline:
 *
 * 1. Selector health-check validator
 *    Problem: The static AUTOMATION_TEMPLATES array contains selector strings
 *    (e.g. `#first_name`) with no verification that those selectors exist on
 *    the configured startUrl.
 *    Fix: `validateTemplateSelectors()` accepts a Playwright Page that has
 *    already navigated to the template's startUrl, then batch-checks all field
 *    selectors in a single page.evaluate() call. Returns a per-field health
 *    report (selector string, found: boolean) plus a top-level `valid` flag.
 *
 * 2. Registry health-check runner
 *    `runRegistryHealthCheck()` iterates all templates, navigates to each
 *    startUrl, validates selectors, and returns a health report per template.
 *    This is designed to be called from a cron job or admin endpoint — not on
 *    every request.
 *
 * Note: Playwright-specific selectors (`:has-text()`, `nth=`) cannot be run
 * inside page.evaluate(); those are validated individually via locator().count()
 * after the CSS batch. This keeps the common case (pure CSS selectors) in a
 * single round-trip.
 */

import type { Page } from "playwright";
import type { AutomationTemplate } from "./types";

// ── Static built-in templates ─────────────────────────────────────────────────

export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  {
    templateKey: "demo-intake-form",
    name:        "Demo Intake Form",
    description: "Example browser automation template for testing the automation layer",
    targetType:  "web",
    startUrl:    "https://example.com/form",
    fields: [
      { internalKey: "firstName",  selector: "#first_name",    type: "text",     required: true },
      { internalKey: "lastName",   selector: "#last_name",     type: "text",     required: true },
      { internalKey: "dob",        selector: "#dob",           type: "date"                     },
      { internalKey: "state",      selector: "#state",         type: "select"                   },
      { internalKey: "agree",      selector: "#agree_terms",   type: "checkbox"                 },
    ],
    actions: [
      { type: "goto",          name: "open-form",             url: "https://example.com/form"   },
      { type: "fill",          name: "fill-first-name",       selector: "#first_name",     valueKey: "firstName" },
      { type: "fill",          name: "fill-last-name",        selector: "#last_name",      valueKey: "lastName"  },
      { type: "fill",          name: "fill-dob",              selector: "#dob",            valueKey: "dob"       },
      { type: "select",        name: "select-state",          selector: "#state",          valueKey: "state"     },
      { type: "check",         name: "accept-terms",          selector: "#agree_terms",    valueKey: "agree"     },
      { type: "screenshot",    name: "pre-submit-shot",       screenshotLabel: "pre-submit"                      },
      { type: "humanApproval", name: "await-human-approval",  checkpointName: "before-submit"                   },
      { type: "click",         name: "submit-form",           selector: "button[type='submit']"                 },
      { type: "waitFor",       name: "wait-for-confirmation", selector: ".confirmation",   timeoutMs: 10000      },
      { type: "screenshot",    name: "confirmation-shot",     screenshotLabel: "confirmation"                    },
    ],
  },
];

export function getAutomationTemplate(templateKey: string): AutomationTemplate {
  const template = AUTOMATION_TEMPLATES.find((t) => t.templateKey === templateKey);
  if (!template) throw new Error(`Automation template not found: ${templateKey}`);
  return template;
}

export function listAutomationTemplates(): AutomationTemplate[] {
  return AUTOMATION_TEMPLATES;
}

// ── Selector health-check ─────────────────────────────────────────────────────

export interface FieldHealthResult {
  internalKey: string;
  selector:    string;
  found:       boolean;
  strategy:    "css-batch" | "playwright" | "skipped";
}

export interface TemplateHealthReport {
  templateKey:      string;
  name:             string;
  startUrl:         string;
  valid:            boolean;           // true only if ALL required fields found
  fields:           FieldHealthResult[];
  failedSelectors:  string[];
  checkedAt:        string;
}

/**
 * Validates all field selectors for `template` against the currently-loaded
 * page. The page must already be at the correct URL before calling this.
 *
 * Pure CSS selectors are batch-checked in one page.evaluate() round-trip.
 * Playwright-specific selectors (`:has-text()`, `nth=`) are checked individually.
 */
export async function validateTemplateSelectors(
  page: Page,
  template: AutomationTemplate
): Promise<TemplateHealthReport> {
  const { fields } = template;
  if (fields.length === 0) {
    return {
      templateKey:     template.templateKey,
      name:            template.name,
      startUrl:        template.startUrl,
      valid:           true,
      fields:          [],
      failedSelectors: [],
      checkedAt:       new Date().toISOString(),
    };
  }

  // Partition into CSS-batchable vs Playwright-only selectors
  const cssFields:        typeof fields = [];
  const playwrightFields: typeof fields = [];

  for (const f of fields) {
    const isPlaywrightOnly =
      f.selector.includes(":has-text(") ||
      f.selector.includes("nth=")       ||
      f.selector.includes("css=")       ||
      !f.selector.trim();

    if (isPlaywrightOnly) {
      playwrightFields.push(f);
    } else {
      cssFields.push(f);
    }
  }

  // ── Batch CSS check (1 round-trip) ──────────────────────────────────────────
  let cssResults: boolean[] = [];
  if (cssFields.length > 0) {
    try {
      cssResults = await page.evaluate(
        (selectors: string[]) =>
          selectors.map((s) => {
            try {
              return document.querySelector(s) !== null;
            } catch {
              return false;
            }
          }),
        cssFields.map((f) => f.selector)
      );
    } catch {
      cssResults = cssFields.map(() => false);
    }
  }

  const fieldResults: FieldHealthResult[] = [
    ...cssFields.map((f, i): FieldHealthResult => ({
      internalKey: f.internalKey,
      selector:    f.selector,
      found:       cssResults[i] ?? false,
      strategy:    "css-batch",
    })),
  ];

  // ── Playwright-specific selectors (individual round-trips, last resort) ──────
  for (const f of playwrightFields) {
    if (!f.selector.trim()) {
      fieldResults.push({ internalKey: f.internalKey, selector: f.selector, found: false, strategy: "skipped" });
      continue;
    }
    try {
      const count = await page.locator(f.selector).count();
      fieldResults.push({ internalKey: f.internalKey, selector: f.selector, found: count > 0, strategy: "playwright" });
    } catch {
      fieldResults.push({ internalKey: f.internalKey, selector: f.selector, found: false, strategy: "playwright" });
    }
  }

  // Re-sort to match original field order
  const keyOrder = new Map(fields.map((f, i) => [f.internalKey, i]));
  fieldResults.sort((a, b) => (keyOrder.get(a.internalKey) ?? 0) - (keyOrder.get(b.internalKey) ?? 0));

  const failedSelectors = fieldResults
    .filter((r) => !r.found)
    .map((r) => r.selector);

  // A template is "valid" when all required fields are found (optional missing = OK)
  const requiredByKey = new Map(fields.map((f) => [f.internalKey, f.required ?? false]));
  const requiredFailed = fieldResults.filter(
    (r) => !r.found && requiredByKey.get(r.internalKey)
  );

  return {
    templateKey:     template.templateKey,
    name:            template.name,
    startUrl:        template.startUrl,
    valid:           requiredFailed.length === 0,
    fields:          fieldResults,
    failedSelectors,
    checkedAt:       new Date().toISOString(),
  };
}

// ── Registry-wide health check ────────────────────────────────────────────────

export interface RegistryHealthReport {
  checkedAt:      string;
  totalTemplates: number;
  valid:          number;
  invalid:        number;
  results:        TemplateHealthReport[];
}

/**
 * Iterates all templates in the registry, navigates to each startUrl,
 * and validates selectors. Designed for cron / admin endpoints.
 *
 * @param page A live Playwright Page instance (browser already open).
 */
export async function runRegistryHealthCheck(page: Page): Promise<RegistryHealthReport> {
  const results: TemplateHealthReport[] = [];

  for (const template of AUTOMATION_TEMPLATES) {
    try {
      await page.goto(template.startUrl, { waitUntil: "domcontentloaded", timeout: 15_000 });
    } catch (err) {
      // Can't load the page — mark all selectors as unknown/failed
      results.push({
        templateKey:     template.templateKey,
        name:            template.name,
        startUrl:        template.startUrl,
        valid:           false,
        fields:          template.fields.map((f) => ({
          internalKey: f.internalKey, selector: f.selector,
          found: false, strategy: "skipped" as const,
        })),
        failedSelectors: template.fields.map((f) => f.selector),
        checkedAt:       new Date().toISOString(),
      });
      continue;
    }

    const report = await validateTemplateSelectors(page, template);
    results.push(report);
  }

  return {
    checkedAt:      new Date().toISOString(),
    totalTemplates: AUTOMATION_TEMPLATES.length,
    valid:          results.filter((r) => r.valid).length,
    invalid:        results.filter((r) => !r.valid).length,
    results,
  };
}
