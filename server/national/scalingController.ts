/**
 * Autonomous Scaling Controller
 *
 * "Where the system begins to act like infrastructure, not software."
 *
 * Watches national-level pressure signals and generates concrete operational
 * actions — from telemed capacity additions to cross-region load shifts to
 * emergency protocol activations.
 *
 * This is the autonomous decision layer. It doesn't wait for a human to
 * notice the system is under strain; it detects and prescribes the response.
 *
 * Action triggers:
 *   - Patient volume > 1000  → spin up telemed + activate overflow clinics
 *   - Avg strain > 5         → throttle non-critical compute, enable fast-path
 *   - Any critical surge     → cross-region redistribution
 *   - ER rate > 20%          → activate parallel triage lanes
 *   - National pattern alert → trigger public health coordination
 */

export interface ScalingInput {
  totalPatients:        number;
  avgStrainScore:       number;
  totalER:              number;
  criticalRegions:      string[];
  surgeRegions:         string[];
  nationalPatternAlert: boolean;
}

export interface ScalingAction {
  action:     string;
  priority:   "low" | "medium" | "high" | "critical";
  trigger:    string;
}

export interface ScalingControllerOutput {
  actions:           ScalingAction[];
  alertLevel:        "normal" | "elevated" | "high" | "critical";
  autonomousScale:   boolean;   // true if system should auto-apply actions
  summary:           string;
}

export function computeScalingActions(input: ScalingInput): ScalingControllerOutput {
  const actions: ScalingAction[] = [];

  if (input.totalPatients > 1000) {
    actions.push({ action: "Increase telemed agent capacity (+25%)", priority: "high", trigger: `${input.totalPatients} national patients` });
    actions.push({ action: "Activate overflow clinics in high-density regions", priority: "high", trigger: `Patient volume > 1000` });
  } else if (input.totalPatients > 500) {
    actions.push({ action: "Pre-position telemed capacity (+10%)", priority: "medium", trigger: `${input.totalPatients} national patients` });
  }

  if (input.avgStrainScore > 5) {
    actions.push({ action: "Throttle non-critical compute jobs", priority: "medium", trigger: `Avg strain ${input.avgStrainScore.toFixed(1)}/10` });
    actions.push({ action: "Enable fast-path triage for routine cases", priority: "medium", trigger: `Avg strain ${input.avgStrainScore.toFixed(1)}/10` });
  }

  if (input.avgStrainScore > 7) {
    actions.push({ action: "Activate national command bridge (war room)", priority: "critical", trigger: `Avg strain ${input.avgStrainScore.toFixed(1)}/10 — critical threshold` });
  }

  if (input.criticalRegions.length > 0) {
    actions.push({ action: `Cross-region load redistribution (from: ${input.criticalRegions.join(", ")})`, priority: "critical", trigger: `${input.criticalRegions.length} critical region(s)` });
  }

  if (input.totalPatients > 0 && (input.totalER / input.totalPatients) > 0.2) {
    actions.push({ action: "Activate parallel triage lanes — ER demand elevated", priority: "high", trigger: `ER rate ${((input.totalER / input.totalPatients) * 100).toFixed(1)}%` });
  }

  if (input.nationalPatternAlert) {
    actions.push({ action: "Trigger public health coordination protocol", priority: "critical", trigger: "National complaint cluster detected" });
    actions.push({ action: "Generate WHO/CDC-style syndromic alert", priority: "high", trigger: "National pattern alert" });
  }

  const hasCritical  = actions.some(a => a.priority === "critical");
  const hasHigh      = actions.some(a => a.priority === "high");
  const alertLevel: ScalingControllerOutput["alertLevel"] =
    hasCritical ? "critical" :
    hasHigh     ? "high"     :
    actions.length > 0 ? "elevated" : "normal";

  return {
    actions,
    alertLevel,
    autonomousScale: alertLevel === "critical" || alertLevel === "high",
    summary: actions.length > 0
      ? `${actions.length} scaling action(s) — alert level: ${alertLevel}`
      : "System operating within normal parameters — no scaling required",
  };
}
