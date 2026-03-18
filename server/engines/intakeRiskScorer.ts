import { IntakeDraft } from "./smartIntakeEngine";

export interface IntakeRiskResult {
  riskScore: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  confidenceScore: number;
}

export function scoreIntakeRisk(input: Partial<IntakeDraft>): IntakeRiskResult {
  let score = 0;
  if ((input.redFlags || []).length > 0) score += 70;
  if ((input.missingCriticalData || []).length > 0) score += 10;
  if ((input.age || 0) < 3 && input.age !== undefined) score += 15;
  if ((input.age || 0) > 75) score += 12;

  const cc = (input.chiefComplaint || "").toLowerCase();
  if (cc.includes("chest")) score += 60;
  if (cc.includes("abdominal")) score += 20;
  if (cc.includes("vomiting")) score += 15;
  if (cc.includes("urinary")) score += 10;
  if (cc.includes("rash")) score += 8;
  if (cc.includes("refill")) score -= 20;
  if ((input.symptomDuration || "").includes("month")) score += 10;

  const confidenceScore = calculateConfidence(input);
  if (confidenceScore < 0.6) score += 20;
  if (confidenceScore > 0.9) score -= 8;

  score = Math.max(0, Math.min(100, score));

  let riskLevel: IntakeRiskResult["riskLevel"] = "low";
  if (score >= 80) riskLevel = "critical";
  else if (score >= 55) riskLevel = "high";
  else if (score >= 25) riskLevel = "medium";

  return { riskScore: score, riskLevel, confidenceScore: Number(confidenceScore.toFixed(3)) };
}

function calculateConfidence(input: Partial<IntakeDraft>): number {
  let c = 0.5;
  if (input.chiefComplaint && input.chiefComplaint !== "general_medical_question") c += 0.15;
  if (input.age) c += 0.05;
  if (input.symptomDuration) c += 0.05;
  if ((input.missingCriticalData || []).length === 0) c += 0.1;
  if ((input.redFlags || []).length === 0) c += 0.1;
  if ((input.answers || []).length >= 3) c += 0.1;
  return Math.max(0, Math.min(0.99, c));
}
