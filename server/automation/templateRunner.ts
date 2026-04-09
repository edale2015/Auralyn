/**
 * Template Runner — Playwright execution + selector healing + audit trail
 *
 * Combines:
 *   - selfHealingReplay (3-layer healing)
 *   - auditStep (immutable CFR-11 audit log)
 *   - metricsTracker (Prometheus counters)
 *   - automationQueue (registers itself as the job handler)
 *
 * Safety contract (CRITICAL):
 *   This runner must NEVER be called when disposition === "escalate".
 *   That guard lives in masterClinicalPipeline.ts (fireAndForget is
 *   wrapped in `if (disposition !== "escalate")`).
 */

import { chromium } from "playwright";
import { replayWithHealing }      from "./selfHealingReplay";
import { getStoredTemplate }      from "./templateStore";
import { getAutomationTemplate }  from "./templateRegistry";
import { auditStep }              from "../audit/auditLogger";
import { recordRun }              from "./metricsTracker";
import { registerJobHandler }     from "./queue";
import type { AutomationTemplate } from "./types";
import type { AutomationJob }     from "./queue";

// ── Template resolution (DB first, registry fallback) ─────────────────────────

async function resolveTemplate(templateKey: string): Promise<AutomationTemplate> {
  try {
    const row = await getStoredTemplate(templateKey);
    if (row?.definition) return row.definition as AutomationTemplate;
  } catch {}
  return getAutomationTemplate(templateKey);   // throws if not found
}

// ── Core runner ───────────────────────────────────────────────────────────────

export async function runTemplate(
  templateKey: string,
  payload:     Record<string, unknown>,
  traceId:     string
): Promise<{ ok: boolean; result?: unknown; error?: string; healedCount: number }> {
  const template = await resolveTemplate(templateKey);
  const browser  = await chromium.launch({ headless: true });

  try {
    const page   = await browser.newPage();
    const report = await replayWithHealing(page, template, payload as Record<string, string>, {
      patchOnHeal: true,
      startedBy:   traceId,
    });

    await auditStep({
      traceId,
      step:     "automation_template_run",
      input:    { templateKey, healedCount: report.healed },
      output:   { ok: report.failed === 0, succeeded: report.succeeded, total: report.total },
      metadata: { healedCount: report.healed, failed: report.failed },
    });

    if (report.failed > 0) {
      const firstFail = report.actions.find((a) => !a.success);
      return {
        ok:          false,
        error:       firstFail?.error ?? `${report.failed} action(s) failed`,
        healedCount: report.healed,
      };
    }

    return { ok: true, result: { succeeded: report.succeeded, healed: report.healed }, healedCount: report.healed };
  } catch (err: any) {
    await auditStep({
      traceId,
      step:     "automation_template_failure",
      input:    { templateKey },
      output:   null,
      metadata: { error: String(err) },
    }).catch(() => {});

    return { ok: false, error: String(err), healedCount: 0 };
  } finally {
    await browser.close().catch(() => {});
  }
}

// ── Job handler registration ──────────────────────────────────────────────────

/**
 * Register this runner as the automation queue handler.
 * Called once at startup from automationStartup().
 */
export function startTemplateRunner(): void {
  registerJobHandler(async (job: AutomationJob) => {
    return runTemplate(job.templateKey, job.payload, job.traceId);
  });
  console.log("[TemplateRunner] Registered as automation job handler");
}

// ── Validation scheduler (every 6 hours) ─────────────────────────────────────

const SIX_HOURS_MS = 6 * 60 * 60 * 1_000;
let _schedulerStarted = false;

export function startValidationScheduler(): void {
  if (_schedulerStarted) return;
  _schedulerStarted = true;

  console.log("[TemplateRunner] Validation scheduler armed (6-hour interval)");

  setInterval(async () => {
    console.log("[TemplateRunner] Running scheduled template validation…");
    try {
      const { runStoredValidation } = await import("./templateValidationWorker");
      const report = await runStoredValidation();
      console.log(
        `[TemplateRunner] Validation complete: ${report.passed}/${report.total} passed, ` +
        `${report.failed} failed`
      );
    } catch (err) {
      console.warn("[TemplateRunner] Scheduled validation error:", err);
    }
  }, SIX_HOURS_MS);
}
