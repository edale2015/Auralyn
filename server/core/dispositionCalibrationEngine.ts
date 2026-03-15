export type RankedDx = {
  diagnosis: string;
  score: number;
};

export type DispositionCalibrationInput = {
  complaint: string;
  proposedDisposition: string;
  aggregatedDifferentials: RankedDx[];
  entropy?: number;
  redFlags?: string[];
  supervisorDecision?: string;
  riskLevel?: "low" | "moderate" | "high" | string;
  guidelinePassed?: boolean;
  contradictionHasErrors?: boolean;
  severityLevel?: "low" | "moderate" | "high" | "critical" | string;
  completenessPassed?: boolean;
};

export type DispositionCalibrationOutput = {
  finalDisposition: string;
  calibrationAction: "unchanged" | "escalated" | "softened";
  confidenceBand: "low" | "moderate" | "high";
  reasons: string[];
};

const HIGH_ACUITY_DX = new Set([
  "acute_coronary_syndrome", "acs",
  "pulmonary_embolism",
  "aortic_dissection",
  "stroke",
  "subarachnoid_hemorrhage",
  "ectopic_pregnancy",
  "ovarian_torsion",
  "testicular_torsion",
  "appendicitis",
  "bowel_obstruction",
  "sepsis",
  "meningitis",
  "pneumothorax",
  "intracranial_bleed",
  "gi_bleed",
  "pyelonephritis",
  "epiglottitis",
  "anaphylaxis",
]);

const BENIGN_DX = new Set([
  "viral_uri",
  "allergic_rhinitis",
  "simple_cystitis",
  "pharyngitis",
  "acute_pharyngitis",
  "otitis_media",
  "non_specific_low_back_pain",
  "tension_headache",
  "viral_gastroenteritis",
]);

function maxScore(dxs: RankedDx[]): number {
  return dxs.length ? dxs[0].score : 0;
}

export function dispositionCalibrationEngine(
  input: DispositionCalibrationInput
): DispositionCalibrationOutput {
  const reasons: string[] = [];
  const topDx        = input.aggregatedDifferentials[0]?.diagnosis ?? "";
  const topScore     = maxScore(input.aggregatedDifferentials);
  const entropy      = input.entropy ?? 999;
  const hasRedFlags  = (input.redFlags ?? []).length > 0;
  const highRisk     = input.riskLevel === "high";
  const contradiction = !!input.contradictionHasErrors;
  const guidelineFailed = input.guidelinePassed === false;
  const criticalSeverity = input.severityLevel === "critical";
  const incomplete = input.completenessPassed === false;

  let finalDisposition  = (input.proposedDisposition || "needs_workup").toLowerCase();
  let calibrationAction: "unchanged" | "escalated" | "softened" = "unchanged";

  // ── Confidence band ────────────────────────────────────────────────────────
  let confidenceBand: "low" | "moderate" | "high" = "moderate";
  if (topScore >= 0.8 && entropy < 0.6)  confidenceBand = "high";
  else if (topScore < 0.45 || entropy > 1.2) confidenceBand = "low";

  // ── Escalation rules (ordered by severity) ─────────────────────────────────

  if (contradiction) {
    finalDisposition  = "needs_physician_review";
    calibrationAction = "escalated";
    reasons.push("Contradiction errors present — physician review required");
  }

  if (hasRedFlags && finalDisposition !== "er_now") {
    finalDisposition  = "er_now";
    calibrationAction = "escalated";
    reasons.push("Red flags present — escalating to ER");
  }

  if (criticalSeverity && finalDisposition !== "er_now") {
    finalDisposition  = "er_now";
    calibrationAction = "escalated";
    reasons.push("Critical severity score — emergency escalation");
  }

  if (incomplete && ["home_care", "routine_followup"].includes(finalDisposition)) {
    finalDisposition  = "needs_workup";
    calibrationAction = "escalated";
    reasons.push("Complaint completeness requirements not met");
  }

  if (HIGH_ACUITY_DX.has(topDx) && topScore >= 0.55) {
    if (!["er_now", "ed_now", "needs_physician_review"].includes(finalDisposition)) {
      finalDisposition  = "needs_workup";
      calibrationAction = "escalated";
    }
    reasons.push(`High-acuity top diagnosis: ${topDx}`);
  }

  if (highRisk && ["home_care", "routine_followup"].includes(finalDisposition)) {
    finalDisposition  = "needs_workup";
    calibrationAction = "escalated";
    reasons.push("High-risk patient context — cannot discharge without workup");
  }

  if (guidelineFailed && finalDisposition === "home_care") {
    finalDisposition  = "needs_workup";
    calibrationAction = "escalated";
    reasons.push("Guideline adherence check failed");
  }

  if (input.supervisorDecision === "NEEDS_PHYSICIAN_REVIEW" &&
      !["er_now", "ed_now"].includes(finalDisposition)) {
    finalDisposition  = "needs_physician_review";
    calibrationAction = "escalated";
    reasons.push("Supervisor requires physician review");
  }

  if (confidenceBand === "low" && finalDisposition === "home_care") {
    finalDisposition  = "needs_workup";
    calibrationAction = "escalated";
    reasons.push("Low diagnostic confidence — home care not safe");
  }

  // ── Softening rule (high-confidence benign presentation) ─────────────────
  if (
    confidenceBand === "high" &&
    !hasRedFlags &&
    !highRisk &&
    !guidelineFailed &&
    !contradiction &&
    BENIGN_DX.has(topDx) &&
    finalDisposition === "needs_workup"
  ) {
    finalDisposition  = "home_care";
    calibrationAction = "softened";
    reasons.push("High-confidence benign presentation — home care appropriate");
  }

  if (reasons.length === 0) reasons.push("Disposition unchanged after calibration");

  return { finalDisposition, calibrationAction, confidenceBand, reasons };
}
