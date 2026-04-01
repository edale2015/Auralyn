import { getLearnedDenialScore } from "../billing/claimOutcomeLearning";
import { getOutcomeLog } from "../billing/claimOutcomeLearning";

export interface DenialPrediction {
  payerId: string;
  cptCode: string;
  probability: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  reasons: string[];
  mitigationSteps: string[];
  confidence: number;
}

const HIGH_RISK_CPT_FAMILIES = ["99283", "99284", "99285", "99291", "99292"];
const MEDIUM_RISK_CPT_FAMILIES = ["99281", "99282", "99281"];

const PAYER_DENIAL_MODIFIERS: Record<string, number> = {
  UHC: 0.14,
  MEDICAID: 0.18,
  AETNA: 0.12,
  CIGNA: 0.09,
  BCBS: 0.08,
  HUMANA: 0.11,
  MEDICARE: 0.06,
};

export function predictDenialByPayer(payerId: string, cptCode: string, icd10?: string): DenialPrediction {
  const log = getOutcomeLog(500);
  const relevantClaims = log.filter(c =>
    (c as any).cptCode === cptCode || (c as any).icd10 === icd10
  );

  const historicalDenialRate = relevantClaims.length > 0
    ? relevantClaims.filter(c => !(c as any).paid).length / relevantClaims.length
    : 0;

  const payerBaseline = PAYER_DENIAL_MODIFIERS[payerId.toUpperCase()] ?? 0.12;
  const learnedScore = icd10 ? getLearnedDenialScore(icd10, cptCode) : 0;

  let baseProbability = payerBaseline;
  if (relevantClaims.length >= 5) {
    baseProbability = historicalDenialRate * 0.6 + payerBaseline * 0.4;
  }
  baseProbability = Math.max(baseProbability * (1 - learnedScore * 0.2), 0);

  const reasons: string[] = [];

  if (HIGH_RISK_CPT_FAMILIES.includes(cptCode)) {
    baseProbability = Math.min(baseProbability * 1.4, 0.95);
    reasons.push("High-complexity CPT code with elevated ED payer scrutiny");
  }

  if (payerBaseline > 0.15) {
    reasons.push(`${payerId} has above-average historical denial rate (${(payerBaseline * 100).toFixed(0)}%)`);
  }

  if (historicalDenialRate > 0.25) {
    reasons.push(`This CPT has a ${(historicalDenialRate * 100).toFixed(0)}% denial rate in recent claims`);
  }

  if (relevantClaims.length < 10) {
    reasons.push("Limited historical data — prediction confidence is reduced");
  }

  if (reasons.length === 0) {
    reasons.push("Low-risk CPT and payer combination");
  }

  let riskLevel: DenialPrediction["riskLevel"] = "low";
  if (baseProbability >= 0.40) riskLevel = "critical";
  else if (baseProbability >= 0.25) riskLevel = "high";
  else if (baseProbability >= 0.12) riskLevel = "medium";

  const mitigationSteps: string[] = [];
  if (riskLevel === "critical" || riskLevel === "high") {
    mitigationSteps.push("Attach supporting medical necessity documentation before submission");
    mitigationSteps.push("Verify prior authorization requirements for this CPT/payer combination");
    mitigationSteps.push("Review payer's medical policy for coverage criteria");
  }
  if (riskLevel === "medium") {
    mitigationSteps.push("Ensure clinical documentation fully supports medical necessity");
    mitigationSteps.push("Double-check modifier usage for this CPT code");
  }
  if (riskLevel === "low") {
    mitigationSteps.push("Standard submission — documentation review recommended");
  }

  const confidence = relevantClaims.length >= 20 ? 0.92 :
    relevantClaims.length >= 10 ? 0.78 :
    relevantClaims.length >= 5 ? 0.62 : 0.45;

  return {
    payerId,
    cptCode,
    probability: Math.round(baseProbability * 1000) / 1000,
    riskLevel,
    reasons,
    mitigationSteps,
    confidence,
  };
}

export function batchPredictDenial(
  payerId: string,
  cptCodes: string[],
  icd10?: string
): DenialPrediction[] {
  return cptCodes
    .map(cpt => predictDenialByPayer(payerId, cpt, icd10))
    .sort((a, b) => b.probability - a.probability);
}
