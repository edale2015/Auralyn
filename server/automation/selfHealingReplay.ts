/**
 * Upgrade 3 — Self-Healing Replay Engine
 *
 * Wraps the existing action runner with three layers of resilience:
 *
 *   Layer 1 — Standard healing  (healSelector, 2 round-trips)
 *   Layer 2 — Score-sorted candidates (prefer historically-successful selectors)
 *   Layer 3 — AI generation     (OpenAI fallback when all else fails)
 *
 * When a selector is healed, the template definition in the DB is patched
 * with the working replacement so future replays use it immediately.
 *
 * All outcomes (success / failure / healed) are recorded in selector_scores
 * so the confidence system accumulates signal over time.
 */

import type { Page } from "playwright";
import type { AutomationAction, AutomationTemplate } from "./types";
import { healSelector }               from "./selectorHealing";
import { generateAndVerifySelectors } from "./aiSelectorGenerator";
import { recordSelectorResult, sortCandidatesByScore } from "./selectorScore";
import { saveRecordedTemplate }       from "./templateStore";

export interface ActionResult {
  name:       string;
  selector?:  string;
  healed?:    string;   // selector that replaced the original, if any
  aiHealed?:  boolean;  // true if AI generation was used
  success:    boolean;
  error?:     string;
}

export interface ReplayReport {
  templateKey: string;
  total:       number;
  succeeded:   number;
  failed:      number;
  healed:      number;
  actions:     ActionResult[];
}

// ── Selector resolution with scoring ─────────────────────────────────────────

async function resolveWithHealing(
  page:        Page,
  selector:    string,
  templateKey: string
): Promise<{ resolved: string; aiUsed: boolean } | null> {
  // Layer 1: standard healing (CSS batch + Playwright fallbacks)
  const standard = await healSelector(page, selector);
  if (standard) return { resolved: standard, aiUsed: false };

  // Layer 2: AI generation
  const aiCandidates = await generateAndVerifySelectors(page, selector, templateKey);
  if (aiCandidates.length > 0) {
    // Sort by historical confidence in case we've seen some of these before
    const ranked = await sortCandidatesByScore(templateKey, aiCandidates);
    return { resolved: ranked[0], aiUsed: true };
  }

  return null;
}

// ── Single-action executor ────────────────────────────────────────────────────

async function executeAction(
  page:        Page,
  action:      AutomationAction,
  payload:     Record<string, string>,
  templateKey: string
): Promise<ActionResult> {
  const { name, type, selector: rawSelector, valueKey, url, timeoutMs } = action;
  const result: ActionResult = { name, selector: rawSelector, success: false };

  try {
    // Actions with no selector (goto, screenshot, humanApproval, waitForNetworkIdle)
    if (type === "goto" && url) {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs ?? 15_000 });
      result.success = true;
      return result;
    }

    if (type === "screenshot") {
      // no-op in this context — screenshots handled by calling layer
      result.success = true;
      return result;
    }

    if (type === "humanApproval") {
      result.success = true;
      return result;
    }

    if (!rawSelector) {
      result.success = true;
      return result;
    }

    // ── Selector resolution with all 3 healing layers ─────────────────────
    const resolution = await resolveWithHealing(page, rawSelector, templateKey);
    if (!resolution) {
      await recordSelectorResult(templateKey, rawSelector, false);
      result.error = `Selector could not be healed: ${rawSelector}`;
      return result;
    }

    const { resolved, aiUsed } = resolution;
    const wasHealed = resolved !== rawSelector;

    result.healed   = wasHealed ? resolved : undefined;
    result.aiHealed = wasHealed && aiUsed;

    const value = valueKey ? (payload[valueKey] ?? "") : "";

    if (type === "fill") {
      await page.locator(resolved).fill(value, { timeout: timeoutMs ?? 5_000 });
    } else if (type === "select") {
      await page.locator(resolved).selectOption(value, { timeout: timeoutMs ?? 5_000 });
    } else if (type === "check") {
      const checked = value === "true" || value === "1" || value === "yes";
      if (checked) await page.locator(resolved).check({ timeout: timeoutMs ?? 5_000 });
      else          await page.locator(resolved).uncheck({ timeout: timeoutMs ?? 5_000 });
    } else if (type === "click") {
      await page.locator(resolved).click({ timeout: timeoutMs ?? 5_000 });
    } else if (type === "waitFor") {
      await page.locator(resolved).waitFor({ state: "visible", timeout: timeoutMs ?? 10_000 });
    }

    await recordSelectorResult(templateKey, resolved, true);
    result.success = true;
    return result;
  } catch (err: any) {
    if (rawSelector) {
      await recordSelectorResult(templateKey, rawSelector, false);
    }
    result.error = err?.message ?? "unknown error";
    return result;
  }
}

// ── Patch template if healings occurred ──────────────────────────────────────

async function patchTemplateIfHealed(
  template:   AutomationTemplate,
  actionResults: ActionResult[],
  archivedBy: string
): Promise<void> {
  const healedPairs = actionResults
    .filter((r) => r.healed && r.selector)
    .map((r) => ({ original: r.selector!, replacement: r.healed! }));

  if (healedPairs.length === 0) return;

  const patchedActions = template.actions.map((a) => {
    const pair = healedPairs.find((p) => p.original === a.selector);
    return pair ? { ...a, selector: pair.replacement } : a;
  });

  const patchedFields = template.fields.map((f) => {
    const pair = healedPairs.find((p) => p.original === f.selector);
    return pair ? { ...f, selector: pair.replacement } : f;
  });

  await saveRecordedTemplate(
    { ...template, actions: patchedActions, fields: patchedFields },
    archivedBy
  );

  console.log(
    `[selfHealingReplay] Patched ${healedPairs.length} selector(s) in template "${template.templateKey}"`
  );
}

// ── Main public entry point ───────────────────────────────────────────────────

export async function replayWithHealing(
  page:       Page,
  template:   AutomationTemplate,
  payload:    Record<string, string>,
  options:    { patchOnHeal?: boolean; startedBy?: string } = {}
): Promise<ReplayReport> {
  const { patchOnHeal = true, startedBy = "system/replay" } = options;
  const actionResults: ActionResult[] = [];

  for (const action of template.actions) {
    const result = await executeAction(page, action, payload, template.templateKey);
    actionResults.push(result);

    if (!result.success) {
      console.warn(
        `[selfHealingReplay] Action "${action.name}" failed: ${result.error}`
      );
    } else if (result.healed) {
      console.log(
        `[selfHealingReplay] Healed "${result.selector}" → "${result.healed}"` +
        (result.aiHealed ? " (AI)" : " (standard)")
      );
    }
  }

  // Patch template in DB if any selectors were healed
  if (patchOnHeal) {
    await patchTemplateIfHealed(template, actionResults, startedBy).catch((err) =>
      console.warn("[selfHealingReplay] Template patch failed:", err)
    );
  }

  const succeeded = actionResults.filter((r) => r.success).length;
  const healed    = actionResults.filter((r) => r.healed).length;

  return {
    templateKey: template.templateKey,
    total:       actionResults.length,
    succeeded,
    failed:      actionResults.length - succeeded,
    healed,
    actions:     actionResults,
  };
}
