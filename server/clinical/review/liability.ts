import { logSecureEvent } from "../../ops/secureAudit";

export type LiabilityRisk = "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
export type OutcomeType = "confirmed_correct" | "confirmed_wrong" | "adverse" | "unknown" | "pending";

export interface LiabilityReport {
  reportId: string;
  encounterId: string;
  reviewId?: string;
  aiDiagnosis: string;
  physicianDiagnosis: string;
  outcome: OutcomeType;
  risk: LiabilityRisk;
  flag?: string;
  factors: string[];
  recommendation: string;
  computedAt: string;
}

const liabilityLog: LiabilityReport[] = [];

export function computeLiability(input: {
  encounterId: string;
  reviewId?: string;
  ai: string;
  physician: string;
  outcome: OutcomeType;
  aiConfidence?: number;
  overrideReason?: string;
}): LiabilityReport {
  const { ai, physician, outcome, aiConfidence = 0 } = input;
  const override = ai !== physician;

  const factors: string[] = [];
  let risk: LiabilityRisk = "LOW";
  let flag: string | undefined;
  let recommendation = "No action required.";

  if (!override && outcome === "confirmed_correct") {
    risk = "LOW";
    factors.push("AI and physician agreement");
    factors.push("outcome confirmed correct");
    recommendation = "No action required.";
  } else if (!override && outcome === "confirmed_wrong") {
    risk = "MODERATE";
    factors.push("Shared misdiagnosis — AI and physician both incorrect");
    recommendation = "Review diagnostic criteria; consider protocol update.";
  } else if (override && outcome === "confirmed_correct") {
    risk = "MODERATE";
    factors.push("Physician overrode AI");
    factors.push("Outcome confirmed correct — physician was right");
    recommendation = "Log override reason for training data; consider AI recalibration.";
  } else if (override && outcome === "adverse") {
    risk = "CRITICAL";
    flag = "OVERRIDE_WITH_ADVERSE_OUTCOME";
    factors.push("Physician overrode AI recommendation");
    factors.push("Patient suffered adverse outcome after override");
    if (aiConfidence >= 0.8) {
      factors.push(`AI had high confidence (${(aiConfidence * 100).toFixed(0)}%) — override may have been contraindicated`);
      risk = "CRITICAL";
    }
    recommendation = "Immediate quality review. Mandatory incident report. Legal/compliance notification.";
  } else if (override && outcome === "confirmed_wrong") {
    risk = "HIGH";
    flag = "AI_OVERRIDE_WRONG_OUTCOME";
    factors.push("AI overridden — both AI and physician incorrect");
    recommendation = "System-wide diagnostic audit. Consider retraining on case cohort.";
  } else if (override && outcome === "unknown") {
    risk = "MODERATE";
    factors.push("Override recorded; outcome pending");
    recommendation = "Follow up in 72 hours to record patient outcome.";
  } else {
    risk = "LOW";
    recommendation = "Continue monitoring.";
  }

  const report: LiabilityReport = {
    reportId: `LIAB-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    encounterId: input.encounterId,
    reviewId: input.reviewId,
    aiDiagnosis: ai,
    physicianDiagnosis: physician,
    outcome,
    risk,
    flag,
    factors,
    recommendation,
    computedAt: new Date().toISOString(),
  };

  liabilityLog.push(report);

  if (risk === "HIGH" || risk === "CRITICAL") {
    logSecureEvent({
      type: "LIABILITY_FLAG",
      ...report,
    });
  }

  return report;
}

export function getLiabilityLog(): LiabilityReport[] {
  return liabilityLog.slice(-200);
}

export function getLiabilityStats() {
  const total = liabilityLog.length;
  const critical = liabilityLog.filter((r) => r.risk === "CRITICAL").length;
  const high = liabilityLog.filter((r) => r.risk === "HIGH").length;
  return { total, critical, high, active: true };
}
