import type { AutoCodeResult } from "./diagnosisAutoCoder";
import type { RiskClassification } from "../compliance/riskEngine";

export interface DenialPrediction {
  riskScore: number;
  riskLevel: "low" | "medium" | "high";
  reasons: string[];
  recommendations: string[];
  estimatedRevenueImpact: number;
}

const CPT_PRICING: Record<string, number> = {
  "99213": 75,
  "99203": 90,
  "99214": 110,
  "99215": 150,
  "99284": 250,
  "99285": 400,
  "99441": 40,
  "99443": 85,
};

function normalizeTriage(triage: string): string {
  return triage.toLowerCase().trim();
}

function isERTriage(triage: string): boolean {
  const t = normalizeTriage(triage);
  return t === "er" || t === "emergency" || t === "er_now";
}

function isUrgentTriage(triage: string): boolean {
  return normalizeTriage(triage) === "urgent";
}

function isRoutineTriage(triage: string): boolean {
  return normalizeTriage(triage) === "routine";
}

export function predictDenial(bundle: {
  coding: AutoCodeResult;
  riskClassification: RiskClassification;
  encounter: {
    complaint: string;
    diagnosis: string;
    triage: string;
    confidence?: number;
  };
  clinicalNote: {
    hpi: string;
    assessment: string;
    plan: string;
  };
}): DenialPrediction {
  let risk = 0;
  const reasons: string[] = [];
  const recommendations: string[] = [];
  const triage = bundle.encounter.triage;

  if (!bundle.coding.primary.mapped) {
    risk += 0.35;
    reasons.push("Primary ICD-10 code unmapped (R69) — payers frequently deny unspecified diagnoses");
    recommendations.push("Map to a specific ICD-10 code or add supporting documentation for the unspecified code");
  }

  const unmappedDiffs = bundle.coding.differentials.filter((d) => !d.mapped);
  if (unmappedDiffs.length > 0) {
    risk += 0.05 * unmappedDiffs.length;
    reasons.push(`${unmappedDiffs.length} differential(s) unmapped — secondary codes may be denied`);
    recommendations.push("Review and map all differential diagnoses to specific ICD-10 codes");
  }

  const cptCode = bundle.coding.cpt.code;
  const highCPTs = ["99215", "99285", "99284"];
  if (highCPTs.includes(cptCode) && (bundle.encounter.confidence ?? 1) < 0.7) {
    risk += 0.25;
    reasons.push(`High-complexity CPT (${cptCode}) with low diagnostic confidence (${((bundle.encounter.confidence ?? 0) * 100).toFixed(0)}%) — upcoding risk`);
    recommendations.push("Increase documentation detail or downcode to match clinical complexity");
  }

  if (cptCode === "99215" && isRoutineTriage(triage)) {
    risk += 0.3;
    reasons.push("CPT 99215 (high complexity) assigned to routine triage — level mismatch");
    recommendations.push("Downcode to 99213/99214 or reclassify visit complexity");
  }

  if (cptCode === "99213" && isERTriage(triage)) {
    risk += 0.2;
    reasons.push("CPT 99213 (low complexity) assigned to ER triage — undercoding detected");
    recommendations.push("Upcode to 99284/99285 to match emergency visit complexity");
  }

  const icdCode = bundle.coding.primary.icd10;
  const cardiacCodes = ["I20", "I21", "I26", "I48", "I63", "I82"];
  if (cardiacCodes.some((prefix) => icdCode.startsWith(prefix))) {
    const allNoteText = [
      bundle.clinicalNote.hpi,
      bundle.clinicalNote.assessment,
      bundle.clinicalNote.plan,
    ].join(" ").toLowerCase();

    const hasSupportingData = ["vitals", "ecg", "troponin", "ekg", "blood pressure", "heart rate", "cardiac enzymes", "st elevation", "st depression"].some(
      (term) => allNoteText.includes(term)
    );

    if (!hasSupportingData) {
      risk += 0.15;
      reasons.push(`Cardiac/vascular diagnosis (${icdCode}) without documented supporting data`);
      recommendations.push("Add vitals, ECG findings, or cardiac biomarker results to clinical note");
    }
  }

  if (bundle.clinicalNote.hpi.length < 50) {
    risk += 0.1;
    reasons.push("Insufficient HPI documentation — may not meet payer documentation requirements");
    recommendations.push("Expand history of present illness with onset, duration, severity, and associated symptoms");
  }

  if (!bundle.clinicalNote.plan || bundle.clinicalNote.plan.length < 20) {
    risk += 0.1;
    reasons.push("Insufficient care plan documentation");
    recommendations.push("Add specific follow-up instructions, medications, and return precautions");
  }

  if (bundle.coding.codingConfidence === "low") {
    risk += 0.15;
    reasons.push("Overall coding confidence is LOW — multiple unmapped codes increase denial probability");
    recommendations.push("Review all diagnosis codes and ensure accurate ICD-10 mapping");
  }

  if (isERTriage(triage) && icdCode.startsWith("R")) {
    risk += 0.1;
    reasons.push(`ER visit with symptom-only ICD code (${icdCode}) — payers prefer definitive diagnoses for ED visits`);
    recommendations.push("If possible, assign a definitive diagnosis code rather than a symptom code");
  }

  const riskClass = bundle.riskClassification;
  if ((riskClass.level === "HIGH" || riskClass.level === "CRITICAL") && !riskClass.requiresPhysicianReview) {
    risk += 0.2;
    reasons.push(`Clinical risk is ${riskClass.level} but physician review not required — payers may question oversight`);
    recommendations.push("Ensure physician review is documented for high-risk encounters");
  }

  if (riskClass.level === "CRITICAL" && isRoutineTriage(triage)) {
    risk += 0.15;
    reasons.push("CRITICAL clinical risk with routine triage disposition — inconsistency may trigger audit");
    recommendations.push("Re-evaluate triage level for critical-risk patients");
  }

  risk = Math.min(risk, 1);

  const estimatedRevenue = CPT_PRICING[cptCode] || 75;
  const estimatedRevenueImpact = Math.round(estimatedRevenue * risk * 100) / 100;

  let riskLevel: "low" | "medium" | "high";
  if (risk <= 0.2) riskLevel = "low";
  else if (risk <= 0.5) riskLevel = "medium";
  else riskLevel = "high";

  if (reasons.length === 0) {
    reasons.push("No denial risk factors detected");
  }

  return {
    riskScore: Math.round(risk * 1000) / 1000,
    riskLevel,
    reasons,
    recommendations,
    estimatedRevenueImpact,
  };
}

export function batchPredictDenials(bundles: Array<Parameters<typeof predictDenial>[0]>): {
  predictions: DenialPrediction[];
  summary: {
    totalBundles: number;
    highRisk: number;
    mediumRisk: number;
    lowRisk: number;
    totalRevenueAtRisk: number;
  };
} {
  const predictions = bundles.map(predictDenial);
  return {
    predictions,
    summary: {
      totalBundles: predictions.length,
      highRisk: predictions.filter((p) => p.riskLevel === "high").length,
      mediumRisk: predictions.filter((p) => p.riskLevel === "medium").length,
      lowRisk: predictions.filter((p) => p.riskLevel === "low").length,
      totalRevenueAtRisk: Math.round(predictions.reduce((sum, p) => sum + p.estimatedRevenueImpact, 0) * 100) / 100,
    },
  };
}
