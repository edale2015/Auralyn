/**
 * Autonomous Oversight Agent — AI Chief Medical Officer + SRE + QA Director
 *
 * This is the SYSTEM-LEVEL oversight agent, distinct from oversightAgent.ts
 * which operates at the per-encounter level.
 *
 * This agent runs periodically (or on-demand) and asks:
 *   "Is the SYSTEM getting worse across all patients?"
 *   "Where are we failing at population scale?"
 *   "Is anything dangerous enough to block deployments?"
 *   "Should we slow down or alert the ops team?"
 *
 * It does NOT replace clinicians. It protects them from system failure.
 *
 * Adaptations vs. packet:
 *   - clusterFailures() returns ClusterReport (.clusters[]) not an array —
 *     packet used clusters[0][0] which would throw; we use .clusters[0].complaint
 *   - generateSystemAlerts() returns SystemAlert[] with objects, not strings —
 *     we map .message for human-readable alert list
 */

import { detectClinicalDrift }            from "../meta/driftDetector";
import { clusterFailures }               from "../meta/failureClusterer";
import { generateSystemAlerts }          from "../meta/selfHealingAgent";
import { auditStep }                     from "../audit/auditLogger";
import { getAutomationHealthSnapshot }   from "./automationMonitor";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OversightInput {
  outcomes: Array<{
    complaint:            string;
    predictedDisposition: string;
    actualOutcome:        string;
    features?:            Record<string, unknown>;
    caseId?:              string;
  }>;
  systemMetrics: {
    latency:              number;
    errorRate:            number;
    fhirFailures:         number;
    safetyMismatchRate:   number;
    degradedRate?:        number;
    rlhfViolations?:      number;
  };
  kbVersion:  string;
  timestamp:  number;
}

export interface OversightDecision {
  alerts:         string[];
  actions:        string[];
  severity:       "low" | "medium" | "high" | "critical";
  driftReport?:   { driftDetected: boolean; magnitude: number; severity: string };
  topCluster?:    { complaint: string; ageGroup: string; count: number } | null;
  summary:        string;
}

// ── Agent ─────────────────────────────────────────────────────────────────────

export async function runOversightAgent(
  input:   OversightInput,
  traceId: string
): Promise<OversightDecision> {
  const alerts:  string[] = [];
  const actions: string[] = [];

  // ── 1. Clinical drift detection ───────────────────────────────────────────
  const drift = detectClinicalDrift(input.outcomes);

  if (drift.driftDetected) {
    alerts.push(
      `Clinical drift detected: ER rate ${(drift.currentErRate * 100).toFixed(1)}% ` +
      `vs baseline ${(drift.baselineErRate * 100).toFixed(1)}% ` +
      `(Δ ${drift.driftMagnitude >= 0 ? "+" : ""}${(drift.driftMagnitude * 100).toFixed(1)}%) — ${drift.severity}`
    );
    actions.push("Trigger meta-learning cycle to update system priors");
  }

  // ── 2. Failure clustering ─────────────────────────────────────────────────
  // clusterFailures() returns ClusterReport (.clusters array of FailureCluster)
  const clusterReport = clusterFailures(input.outcomes);
  const topCluster    = clusterReport.clusters[0] ?? null;

  if (topCluster) {
    alerts.push(
      `Top failure cluster: ${topCluster.complaint} / ${topCluster.ageGroup} ` +
      `(${topCluster.count} failure${topCluster.count !== 1 ? "s" : ""})`
    );
    actions.push(`Review ${topCluster.complaint} pathway rules for ${topCluster.ageGroup} patients`);
  }

  // ── 3. System health alerts ───────────────────────────────────────────────
  // generateSystemAlerts returns SystemAlert[] (objects, not strings)
  const systemAlerts = generateSystemAlerts({
    errorRate:       input.systemMetrics.errorRate,
    fhirFailureRate: input.systemMetrics.fhirFailures,
    latencyMs:       input.systemMetrics.latency,
    safetyMismatches: Math.round(input.systemMetrics.safetyMismatchRate * (input.outcomes.length || 1)),
    degradedRate:    input.systemMetrics.degradedRate,
    rlhfViolations:  input.systemMetrics.rlhfViolations,
  });

  // Flatten to human-readable strings for the decision output
  alerts.push(...systemAlerts.map(a => `[${a.severity.toUpperCase()}] ${a.system}: ${a.message}`));

  // ── 4b. Automation layer health ───────────────────────────────────────────
  // Check runs after system health so alert count feeds into section 5 severity.
  try {
    const automationHealth = await getAutomationHealthSnapshot();
    if (automationHealth.alert) {
      alerts.push(`[AUTOMATION] ${automationHealth.alert}`);
      actions.push(...automationHealth.actions);
    }
  } catch (_e) {
    // Automation monitor is non-critical — oversight continues without it
  }

  // ── 4. Action recommendations based on system metrics ────────────────────
  if (input.systemMetrics.latency > 3000) {
    actions.push("Reduce cognitive budget to level 3 to improve throughput");
  }
  if (input.systemMetrics.fhirFailures > 0.1) {
    actions.push("Switch FHIR sync to retry queue — EHR endpoint may be unreachable");
  }
  if (input.systemMetrics.safetyMismatchRate > 0) {
    actions.push("BLOCK all deployments immediately — run golden case validation first");
  }

  // ── 5. Severity scoring ───────────────────────────────────────────────────
  let severity: OversightDecision["severity"] = "low";

  if (alerts.length > 3)                              severity = "medium";
  if (input.systemMetrics.safetyMismatchRate > 0)    severity = "high";
  if (input.systemMetrics.safetyMismatchRate > 0.02) severity = "critical";
  if (drift.severity === "critical")                  severity = "critical";

  const decision: OversightDecision = {
    alerts,
    actions,
    severity,
    driftReport:    drift.driftDetected
      ? { driftDetected: true, magnitude: drift.driftMagnitude, severity: drift.severity }
      : undefined,
    topCluster:     topCluster
      ? { complaint: topCluster.complaint, ageGroup: topCluster.ageGroup, count: topCluster.count }
      : null,
    summary:
      `Oversight evaluated ${input.outcomes.length} outcomes with KB v${input.kbVersion}. ` +
      `${alerts.length} issue${alerts.length !== 1 ? "s" : ""} detected — severity: ${severity}.`,
  };

  await auditStep({
    traceId,
    step:     "autonomous_oversight_decision",
    input:    {
      outcomeCount: input.outcomes.length,
      kbVersion:    input.kbVersion,
      metrics:      input.systemMetrics,
    },
    output:   decision,
    metadata: {},
  });

  return decision;
}
