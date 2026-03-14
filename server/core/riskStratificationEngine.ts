export type RiskFactor = {
  label: string;
  severity: "low" | "moderate" | "high";
  reason: string;
  diagnoses?: string[];
};

export type RiskInput = {
  complaint: string;
  normalizedSymptoms: string[];
  answeredQuestions?: Record<string, any>;
};

export type RiskOutput = {
  overallRisk: "low" | "moderate" | "high";
  riskFactors: RiskFactor[];
  diagnosisBoosts: Record<string, number>;
  supervisionFlags: string[];
};

function addBoost(map: Record<string, number>, dxs: string[], weight: number) {
  for (const dx of dxs) map[dx] = (map[dx] || 0) + weight;
}

export function riskStratificationEngine(input: RiskInput): RiskOutput {
  const a = input.answeredQuestions || {};
  const riskFactors: RiskFactor[] = [];
  const diagnosisBoosts: Record<string, number> = {};
  const supervisionFlags: string[] = [];

  const age           = Number(a.age || a.patient_age);
  const pregnant      = !!a.pregnant;
  const immunocomp    = !!a.immunocompromised;
  const anticoag      = !!a.anticoagulated;
  const copd          = !!a.copd;
  const chf           = !!a.chf;
  const diabetes      = !!a.diabetes;
  const cancer        = !!a.active_cancer;
  const recentSurgery = !!a.recent_surgery;
  const recentTravel  = !!a.recent_travel;
  const ckd           = !!a.ckd;
  const pediatric     = Number.isFinite(age) && age < 6;

  // ── Age ───────────────────────────────────────────────────────────────────
  if (Number.isFinite(age) && age >= 65) {
    riskFactors.push({
      label: "older_age",
      severity: "moderate",
      reason: "Age 65+ increases acuity risk and lowers physiological reserve",
    });
    supervisionFlags.push("older_age");
  }

  if (pediatric) {
    riskFactors.push({
      label: "young_child",
      severity: "moderate",
      reason: "Age < 6 requires paediatric-specific dosing and thresholds",
    });
    supervisionFlags.push("young_child");
  }

  // ── Pregnancy ─────────────────────────────────────────────────────────────
  if (pregnant) {
    riskFactors.push({
      label: "pregnancy",
      severity: "high",
      reason: "Pregnancy changes differential and disposition thresholds",
      diagnoses: ["ectopic_pregnancy", "preeclampsia", "pyelonephritis"],
    });
    addBoost(diagnosisBoosts, ["ectopic_pregnancy", "preeclampsia", "pyelonephritis"], 1.0);
    supervisionFlags.push("pregnancy");
  }

  // ── Immunocompromise ──────────────────────────────────────────────────────
  if (immunocomp) {
    riskFactors.push({
      label: "immunocompromised",
      severity: "high",
      reason: "Lower threshold for severe infection and complications",
      diagnoses: ["sepsis", "pneumonia", "meningitis"],
    });
    addBoost(diagnosisBoosts, ["sepsis", "pneumonia", "meningitis"], 1.0);
    supervisionFlags.push("immunocompromised");
  }

  // ── Anticoagulation ───────────────────────────────────────────────────────
  if (anticoag) {
    riskFactors.push({
      label: "anticoagulated",
      severity: "high",
      reason: "Bleeding risk; higher danger from trauma, headache, falls",
      diagnoses: ["intracranial_bleed", "gi_bleed"],
    });
    addBoost(diagnosisBoosts, ["intracranial_bleed", "gi_bleed"], 0.9);
    supervisionFlags.push("anticoagulated");
  }

  // ── Cardiopulmonary comorbidity ───────────────────────────────────────────
  if (copd || chf) {
    riskFactors.push({
      label: "cardiopulmonary_comorbidity",
      severity: "moderate",
      reason: "Respiratory complaints more dangerous with COPD / CHF",
      diagnoses: ["pneumonia", "copd_exacerbation", "heart_failure_exacerbation"],
    });
    addBoost(diagnosisBoosts, ["pneumonia", "copd_exacerbation", "heart_failure_exacerbation"], 0.8);
  }

  // ── Diabetes ──────────────────────────────────────────────────────────────
  if (diabetes) {
    riskFactors.push({
      label: "diabetes",
      severity: "moderate",
      reason: "Raises infection risk and complication risk",
      diagnoses: ["uti", "pyelonephritis", "cellulitis", "sepsis"],
    });
    addBoost(diagnosisBoosts, ["uti", "pyelonephritis", "cellulitis", "sepsis"], 0.6);
  }

  // ── VTE risk context ─────────────────────────────────────────────────────
  if (cancer || recentSurgery || recentTravel) {
    riskFactors.push({
      label: "vte_risk_context",
      severity: "high",
      reason: "Cancer / surgery / travel increase clot risk",
      diagnoses: ["pulmonary_embolism", "dvt"],
    });
    addBoost(diagnosisBoosts, ["pulmonary_embolism", "dvt"], 1.0);
    supervisionFlags.push("vte_risk_context");
  }

  // ── Kidney disease ────────────────────────────────────────────────────────
  if (ckd) {
    riskFactors.push({
      label: "kidney_disease",
      severity: "moderate",
      reason: "Affects dehydration tolerance and medication dosing safety",
      diagnoses: ["aki", "pyelonephritis"],
    });
    addBoost(diagnosisBoosts, ["aki", "pyelonephritis"], 0.5);
  }

  // ── Overall risk rollup ───────────────────────────────────────────────────
  const highCount     = riskFactors.filter((r) => r.severity === "high").length;
  const moderateCount = riskFactors.filter((r) => r.severity === "moderate").length;

  let overallRisk: RiskOutput["overallRisk"] = "low";
  if (highCount >= 1 || moderateCount >= 3) overallRisk = "high";
  else if (moderateCount >= 1)              overallRisk = "moderate";

  return { overallRisk, riskFactors, diagnosisBoosts, supervisionFlags };
}
