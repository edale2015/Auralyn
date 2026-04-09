/**
 * AI Chief Medical Officer (CMO) Agent
 *
 * Narrative intelligence layer — converts raw system signals into executive
 * insight that clinical leadership and investors can understand and act on.
 *
 * It does three things:
 *   1. Summarizes reality    — what happened across the patient population
 *   2. Predicts risk         — what the current trajectory implies
 *   3. Recommends strategy   — what clinical and technical leadership should do
 *
 * This is a reporting agent: it produces a structured report for human review.
 * It never takes autonomous action. All proposed changes still go through the
 * golden case gate and require human approval.
 */

import { auditStep } from "../audit/auditLogger";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ExecutiveMetrics {
  totalPatients:        number;
  erRate:               number;     // 0–1 fraction of patients sent to ER
  safetyMismatchRate:   number;     // 0–1 fraction of encounters with safety mismatch
  avgLatency:           number;     // ms
  topComplaints:        string[];   // top presenting complaints this period
  drift:                number;     // drift magnitude from detectClinicalDrift
}

export interface ExecutiveInput {
  metrics:    ExecutiveMetrics;
  alerts:     string[];            // from autonomousOversightAgent
  clusters:   Array<{             // from failureClusterer
    complaint: string;
    ageGroup:  string;
    count:     number;
  }>;
  timestamp:  number;
}

export interface ExecutiveReport {
  summary:         string;
  risks:           string[];
  recommendations: string[];
  priorities:      string[];
}

// ── Agent ─────────────────────────────────────────────────────────────────────

export async function generateExecutiveReport(
  input:   ExecutiveInput,
  traceId: string
): Promise<ExecutiveReport> {
  const risks:           string[] = [];
  const recommendations: string[] = [];
  const priorities:      string[] = [];

  // ── Risk detection ────────────────────────────────────────────────────────

  if (input.metrics.safetyMismatchRate > 0) {
    risks.push(
      `Safety mismatches detected (${(input.metrics.safetyMismatchRate * 100).toFixed(1)}% of encounters) ` +
      `— potential missed critical cases requiring immediate review`
    );
    priorities.push("Immediate safety audit — run golden case validation before next deployment");
  }

  if (input.metrics.avgLatency > 3000) {
    risks.push(
      `High pipeline latency (${input.metrics.avgLatency}ms) — may delay time-critical triage decisions`
    );
    recommendations.push("Reduce cognitive budget to level 3 for moderate-acuity cases; optimize NLP intake stage");
  }

  if (input.metrics.drift > 0.05) {
    risks.push(
      `Clinical drift of ${(input.metrics.drift * 100).toFixed(1)}% detected — ` +
      `system behavior is diverging from historical baseline`
    );
    priorities.push("Run meta-learning cycle and validate updated priors with golden cases");
  }

  if (input.metrics.erRate > 0.25) {
    risks.push(
      `ER referral rate elevated (${(input.metrics.erRate * 100).toFixed(1)}%) — ` +
      `above expected clinical ceiling of 25%; investigate over-escalation or true acuity shift`
    );
    recommendations.push("Review triage sensitivity thresholds — compare against peer-clinic benchmarks");
  }

  // ── Top failure cluster ───────────────────────────────────────────────────
  if (input.clusters.length > 0) {
    const top = input.clusters[0];
    recommendations.push(
      `Investigate failure cluster: ${top.complaint} in ${top.ageGroup} patients ` +
      `(${top.count} error${top.count !== 1 ? "s" : ""} — highest-impact improvement target)`
    );
  }

  // ── Top complaints narrative ──────────────────────────────────────────────
  const topComplaintsStr = input.metrics.topComplaints.slice(0, 3).join(", ") || "not available";

  // ── Safe operation check ──────────────────────────────────────────────────
  if (input.metrics.safetyMismatchRate === 0 && input.metrics.drift < 0.05 && input.metrics.avgLatency < 2000) {
    recommendations.push("System operating within clinical and technical safety bounds — maintain monitoring cadence");
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const summary =
    `System processed ${input.metrics.totalPatients.toLocaleString()} patient${input.metrics.totalPatients !== 1 ? "s" : ""}. ` +
    `ER rate: ${(input.metrics.erRate * 100).toFixed(1)}%. ` +
    `Avg latency: ${input.metrics.avgLatency}ms. ` +
    `Clinical drift: ${(input.metrics.drift * 100).toFixed(1)}%. ` +
    `Top complaints: ${topComplaintsStr}.`;

  const report: ExecutiveReport = { summary, risks, recommendations, priorities };

  await auditStep({
    traceId,
    step:     "executive_report_generated",
    input:    { ...input.metrics, alertCount: input.alerts.length, clusterCount: input.clusters.length },
    output:   report,
    metadata: {},
  });

  return report;
}
