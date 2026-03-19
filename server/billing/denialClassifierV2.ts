export interface DenialFeatures {
  icd10: string;
  cpt: string;
  payer: string;
  complexity: number;
  documentationScore: number;
  confidence: number;
  hasHPI: boolean;
  hasAssessment: boolean;
  hasPlan: boolean;
  redFlagCount: number;
}

const PAYER_BASELINE_RISK: Record<string, number> = {
  medicare: 0.20,
  medicaid: 0.22,
  aetna: 0.15,
  united: 0.25,
  cigna: 0.16,
  bcbs: 0.18,
  humana: 0.14,
  self_pay: 0.02,
};

const WEIGHTS = {
  icdSpecificity: 0.25,
  cptMismatch: 0.20,
  documentation: 0.20,
  payerRisk: 0.15,
  clinicalConfidence: 0.10,
  noteCompleteness: 0.10,
};

export interface DenialPredictionV2 {
  riskScore: number;
  confidence: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  factors: Array<{ factor: string; contribution: number; detail: string }>;
  recommendations: string[];
}

export function predictDenialV2(features: DenialFeatures): DenialPredictionV2 {
  const factors: DenialPredictionV2["factors"] = [];
  let risk = 0;

  if (features.icd10 === "R69") {
    const contrib = WEIGHTS.icdSpecificity;
    risk += contrib;
    factors.push({ factor: "ICD Specificity", contribution: contrib, detail: "R69 (unspecified) — high denial risk" });
  } else if (features.icd10.startsWith("R")) {
    const contrib = WEIGHTS.icdSpecificity * 0.5;
    risk += contrib;
    factors.push({ factor: "ICD Specificity", contribution: contrib, detail: `${features.icd10} is a symptom code (R-series)` });
  }

  if (features.complexity < 0.5 && (features.cpt === "99214" || features.cpt === "99215" || features.cpt === "99285")) {
    const contrib = WEIGHTS.cptMismatch;
    risk += contrib;
    factors.push({ factor: "CPT Mismatch", contribution: contrib, detail: `High-level CPT ${features.cpt} with low complexity (${features.complexity.toFixed(2)})` });
  }

  if (features.documentationScore < 0.5) {
    const contrib = WEIGHTS.documentation * (1 - features.documentationScore);
    risk += contrib;
    factors.push({ factor: "Documentation", contribution: contrib, detail: `Documentation score ${(features.documentationScore * 100).toFixed(0)}% — below threshold` });
  }

  const payerBaseline = PAYER_BASELINE_RISK[features.payer.toLowerCase()] ?? 0.20;
  risk += payerBaseline * WEIGHTS.payerRisk / 0.20;
  factors.push({ factor: "Payer Risk", contribution: payerBaseline * WEIGHTS.payerRisk / 0.20, detail: `${features.payer} baseline denial risk` });

  if (features.confidence < 0.6) {
    const contrib = WEIGHTS.clinicalConfidence * (1 - features.confidence);
    risk += contrib;
    factors.push({ factor: "Clinical Confidence", contribution: contrib, detail: `Low confidence (${(features.confidence * 100).toFixed(0)}%)` });
  }

  const noteFields = [features.hasHPI, features.hasAssessment, features.hasPlan];
  const missingFields = noteFields.filter((f) => !f).length;
  if (missingFields > 0) {
    const contrib = WEIGHTS.noteCompleteness * (missingFields / 3);
    risk += contrib;
    const missing: string[] = [];
    if (!features.hasHPI) missing.push("HPI");
    if (!features.hasAssessment) missing.push("Assessment");
    if (!features.hasPlan) missing.push("Plan");
    factors.push({ factor: "Note Completeness", contribution: contrib, detail: `Missing: ${missing.join(", ")}` });
  }

  risk = Math.min(risk, 1);
  const confidence = Math.max(0, 1 - risk * 0.5);

  let riskLevel: DenialPredictionV2["riskLevel"] = "low";
  if (risk >= 0.7) riskLevel = "critical";
  else if (risk >= 0.45) riskLevel = "high";
  else if (risk >= 0.25) riskLevel = "medium";

  const recommendations: string[] = [];
  if (features.icd10 === "R69") recommendations.push("Replace R69 with specific diagnosis ICD-10 code");
  if (features.documentationScore < 0.5) recommendations.push("Improve clinical documentation — add detailed HPI and reasoning");
  if (missingFields > 0) recommendations.push("Complete clinical note with all required sections");
  if (features.complexity < 0.5 && features.cpt >= "99214") recommendations.push("Consider downgrading CPT to match complexity level");

  return { riskScore: Math.round(risk * 1000) / 1000, confidence: Math.round(confidence * 1000) / 1000, riskLevel, factors, recommendations };
}

export function buildFeatures(encounter: {
  icd10: string;
  cpt: string;
  payer: string;
  confidence?: number;
  complexity?: number;
  clinicalNote?: { hpi?: string; assessment?: string; plan?: string };
}): DenialFeatures {
  const note = encounter.clinicalNote || {};
  const hpi = note.hpi || "";
  const assessment = note.assessment || "";
  const plan = note.plan || "";
  const docScore = Math.min(1, (hpi.length + assessment.length + plan.length) / 300);

  return {
    icd10: encounter.icd10,
    cpt: encounter.cpt,
    payer: encounter.payer,
    complexity: encounter.complexity ?? 0.5,
    documentationScore: docScore,
    confidence: encounter.confidence ?? 0.7,
    hasHPI: hpi.length > 10,
    hasAssessment: assessment.length > 5,
    hasPlan: plan.length > 5,
    redFlagCount: 0,
  };
}
