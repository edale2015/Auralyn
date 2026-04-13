/**
 * regressionMonitor.ts — Clinical skill regression detection
 *
 * Article 28a (Eval Engine): "runRegressionCheck(skillName, cases) — runs eval
 *  suite. If passRate < 0.95, sends CLINICAL_REGRESSION alert."
 *
 * Article 29 (Skill Evals — the Thursday story):
 *   "On Thursday, after a model update none of us noticed, the skill started
 *    putting revenue numbers in the wrong columns. No error. No warning. The
 *    output looked professional, the formatting was clean and the numbers were
 *    silently wrong. We found out because a client called."
 *
 * This is the exact failure the regression monitor prevents:
 *   Silent failure — output looks clean, numbers are wrong
 *   No warning — skill continues running, no exceptions thrown
 *   Wrong outputs — discovered by end users, not by engineers
 *
 * Honest gaps (Article 29):
 *   "No automatic regression alerts: Benchmark tracks metrics but doesn't
 *    notify you when something degrades. You run it on your own schedule."
 *
 *   → This module closes that gap with a push-alert model.
 *
 * Clinical stakes:
 *   A sepsis-triage skill that silently misclassifies is not a revenue problem.
 *   It is a mortality problem. The regression threshold is 95%, not 80%.
 *   Any slip below 95% pass rate triggers an immediate CLINICAL_REGRESSION alert.
 */

import { runEvalSuite, type EvalCase, type EvalSuiteResult } from "./evalEngine";

// ── Alert types ───────────────────────────────────────────────────────────────

export type AlertSeverity = "critical" | "warning" | "info";

export interface RegressionAlert {
  id:        string;
  type:      "CLINICAL_REGRESSION" | "THRESHOLD_WARNING" | "SKILL_OBSOLETE";
  skill:     string;
  severity:  AlertSeverity;
  passRate:  number;
  threshold: number;
  delta?:    number;             // vs previous run
  message:   string;
  triggeredAt: Date;
}

export interface RegressionCheckResult {
  passRate:  number;
  threshold: number;
  passed:    boolean;           // passRate >= threshold
  alert?:    RegressionAlert;
  suite:     EvalSuiteResult;
}

// ── Alert store ───────────────────────────────────────────────────────────────

const _alerts = new Map<string, RegressionAlert[]>();
let _alertSeq = 1;

function saveAlert(alert: RegressionAlert): void {
  const existing = _alerts.get(alert.skill) ?? [];
  _alerts.set(alert.skill, [...existing, alert]);
}

export function getAlerts(skill?: string): RegressionAlert[] {
  if (skill) return _alerts.get(skill) ?? [];
  return Array.from(_alerts.values()).flat();
}

// ── sendAlert (in-process; real integration would push to PagerDuty/Slack) ────

function sendAlert(alert: Omit<RegressionAlert, "id" | "triggeredAt">): RegressionAlert {
  const full: RegressionAlert = {
    ...alert,
    id:          `alert_${Date.now()}_${_alertSeq++}`,
    triggeredAt: new Date(),
  };
  saveAlert(full);
  console.warn(`[RegressionMonitor] ${full.type} | ${full.skill} | passRate=${(full.passRate * 100).toFixed(1)}% | ${full.message}`);
  return full;
}

// ── runRegressionCheck ────────────────────────────────────────────────────────

export async function runRegressionCheck(
  skillName:  string,
  cases:      EvalCase[],
  threshold = 0.95,  // Article: "passRate < 0.95 → alert"
): Promise<RegressionCheckResult> {
  const suite = await runEvalSuite(skillName, cases);
  const { passRate } = suite;

  if (passRate < threshold) {
    const alert = sendAlert({
      type:      "CLINICAL_REGRESSION",
      skill:     skillName,
      severity:  passRate < 0.7 ? "critical" : "warning",
      passRate,
      threshold,
      message:   `⚠️ Clinical skill regression detected in '${skillName}': pass rate is ${(passRate * 100).toFixed(1)}% (threshold: ${(threshold * 100).toFixed(1)}%). The Thursday Problem: silent failures look clean but are wrong.`,
    });
    return { passRate, threshold, passed: false, alert, suite };
  }

  // Also alert if skill appears obsolete (no improvement over baseline)
  if (suite.necessity.verdict === "redundant" || suite.necessity.verdict === "obsolete") {
    const alert = sendAlert({
      type:      "SKILL_OBSOLETE",
      skill:     skillName,
      severity:  "info",
      passRate,
      threshold,
      delta:     suite.necessity.delta,
      message:   `ℹ️ Skill '${skillName}' may no longer be needed: ${suite.necessity.analysis}. Capability uplift skills have a natural expiration date — evals tell you when to retire them.`,
    });
    return { passRate, threshold, passed: true, alert, suite };
  }

  return { passRate, threshold, passed: true, suite };
}
