/**
 * Self-Healing Alert Agent
 *
 * Observes system health metrics and generates actionable alerts.
 * The agent doesn't fix things automatically — it surfaces specific, targeted
 * recommendations so the ops team knows exactly what to investigate.
 *
 * This is the operational layer of the meta-learning stack:
 *   - High error rate → review NLP intake (stage 1 complaints)
 *   - FHIR failures → check EHR connectivity
 *   - High latency → use per-stage timings to pinpoint the bottleneck
 *   - Safety mismatches → golden case gate triggered
 *   - Drift detected → raise sensitivity review
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SystemHealthMetrics {
  errorRate?:         number;   // 0–1 fraction of pipeline runs that errored
  fhirFailureRate?:   number;   // 0–1 fraction of FHIR syncs that failed
  latencyMs?:         number;   // p95 or average pipeline latency in ms
  safetyMismatches?:  number;   // absolute count in the last simulation run
  driftMagnitude?:    number;   // from detectClinicalDrift()
  degradedRate?:      number;   // 0–1 fraction of runs where degraded=true
  rlhfViolations?:    number;   // count of GOVERNANCE VIOLATION events
}

export interface SystemAlert {
  severity:        "info" | "warning" | "critical";
  system:          string;        // which component
  message:         string;        // what is wrong
  recommendation:  string;        // what to do about it
  metric:          string;        // the specific metric that triggered this
  metricValue:     string | number;
}

// ── Thresholds ────────────────────────────────────────────────────────────────

const THRESHOLDS = {
  errorRate:        { warning: 0.05,   critical: 0.10   },
  fhirFailureRate:  { warning: 0.03,   critical: 0.10   },
  latencyMs:        { warning: 2000,   critical: 4000   },
  safetyMismatches: { warning: 1,      critical: 3      },
  driftMagnitude:   { warning: 0.05,   critical: 0.10   },
  degradedRate:     { warning: 0.10,   critical: 0.25   },
  rlhfViolations:   { warning: 1,      critical: 5      },
};

// ── Agent ─────────────────────────────────────────────────────────────────────

/**
 * Inspect system health metrics and return a prioritized list of alerts.
 * Alerts are sorted critical → warning → info.
 */
export function generateSystemAlerts(metrics: SystemHealthMetrics): SystemAlert[] {
  const alerts: SystemAlert[] = [];

  // ── Error rate ─────────────────────────────────────────────────────────────
  if (metrics.errorRate !== undefined) {
    const severity = grade(metrics.errorRate, THRESHOLDS.errorRate);
    if (severity) {
      alerts.push({
        severity,
        system:         "NLP Intake",
        message:        `Pipeline error rate at ${(metrics.errorRate * 100).toFixed(1)}%`,
        recommendation: "Review stage1_nlp_intake timings and check for empty complaint inputs. Inspect recent error logs for exception patterns.",
        metric:         "errorRate",
        metricValue:    metrics.errorRate,
      });
    }
  }

  // ── FHIR sync failures ────────────────────────────────────────────────────
  if (metrics.fhirFailureRate !== undefined) {
    const severity = grade(metrics.fhirFailureRate, THRESHOLDS.fhirFailureRate);
    if (severity) {
      alerts.push({
        severity,
        system:         "FHIR Sync",
        message:        `FHIR sync failure rate at ${(metrics.fhirFailureRate * 100).toFixed(1)}%`,
        recommendation: "Check EHR endpoint reachability. Review fhirError field in pipeline outputs. Confirm event bus worker is consuming FhirSyncRequested events.",
        metric:         "fhirFailureRate",
        metricValue:    metrics.fhirFailureRate,
      });
    }
  }

  // ── Pipeline latency ──────────────────────────────────────────────────────
  if (metrics.latencyMs !== undefined) {
    const severity = grade(metrics.latencyMs, THRESHOLDS.latencyMs);
    if (severity) {
      alerts.push({
        severity,
        system:         "Pipeline",
        message:        `Pipeline latency at ${metrics.latencyMs}ms`,
        recommendation: "Use stageTimings in pipeline output to identify the bottleneck stage. Common causes: OpenAI API latency (stage2_reasoning), FHIR sync (stage8_fhir_sync), safety pipeline (stage3_safety).",
        metric:         "latencyMs",
        metricValue:    metrics.latencyMs,
      });
    }
  }

  // ── Safety mismatches ─────────────────────────────────────────────────────
  if (metrics.safetyMismatches !== undefined && metrics.safetyMismatches > 0) {
    const severity = grade(metrics.safetyMismatches, THRESHOLDS.safetyMismatches);
    if (severity) {
      alerts.push({
        severity:       "critical",  // always critical regardless of count
        system:         "Safety Pipeline",
        message:        `${metrics.safetyMismatches} golden case safety mismatch(es) detected`,
        recommendation: "Run changeApprovalGate before any deployment. Review sepsis, PEWS, OB, and mental health check thresholds. Check ORDERED_CHECKS priority sequence.",
        metric:         "safetyMismatches",
        metricValue:    metrics.safetyMismatches,
      });
    }
  }

  // ── Clinical drift ────────────────────────────────────────────────────────
  if (metrics.driftMagnitude !== undefined) {
    const severity = grade(Math.abs(metrics.driftMagnitude), THRESHOLDS.driftMagnitude);
    if (severity) {
      alerts.push({
        severity,
        system:         "Clinical Drift",
        message:        `ER referral rate drift at ${(metrics.driftMagnitude * 100).toFixed(1)}% above baseline`,
        recommendation: metrics.driftMagnitude > 0
          ? "Increase safety pipeline sensitivity. Validate proposed changes via golden case gate before applying."
          : "Investigate potential over-routing to routine disposition. Check if safety thresholds are too permissive.",
        metric:         "driftMagnitude",
        metricValue:    metrics.driftMagnitude,
      });
    }
  }

  // ── Degraded run rate ─────────────────────────────────────────────────────
  if (metrics.degradedRate !== undefined) {
    const severity = grade(metrics.degradedRate, THRESHOLDS.degradedRate);
    if (severity) {
      alerts.push({
        severity,
        system:         "Pipeline Stability",
        message:        `${(metrics.degradedRate * 100).toFixed(1)}% of pipeline runs are degraded`,
        recommendation: "Check optional stage failures in stageTimings. Degraded flag is set by: fusion errors, safety check errors, RLHF governance violations, FHIR failures, security log failures.",
        metric:         "degradedRate",
        metricValue:    metrics.degradedRate,
      });
    }
  }

  // ── RLHF governance violations ────────────────────────────────────────────
  if (metrics.rlhfViolations !== undefined && metrics.rlhfViolations > 0) {
    const severity = grade(metrics.rlhfViolations, THRESHOLDS.rlhfViolations);
    if (severity) {
      alerts.push({
        severity:       "critical",  // governance violations are always critical
        system:         "RLHF Governance",
        message:        `${metrics.rlhfViolations} RLHF governance violation(s) in this period`,
        recommendation: "Inspect proposeWeightUpdate() return value. Ensure all proposals have requiresHumanApproval=true and status='pending_review'. Review assertRlhfGated() call site.",
        metric:         "rlhfViolations",
        metricValue:    metrics.rlhfViolations,
      });
    }
  }

  // Sort: critical first, then warning, then info
  const ORDER = { critical: 0, warning: 1, info: 2 };
  return alerts.sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
}

// ── Threshold helper ──────────────────────────────────────────────────────────

function grade(
  value:      number,
  thresholds: { warning: number; critical: number }
): "warning" | "critical" | null {
  if (value >= thresholds.critical) return "critical";
  if (value >= thresholds.warning)  return "warning";
  return null;
}
