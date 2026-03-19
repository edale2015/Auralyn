import type { DenialPredictionV2 } from "./denialClassifierV2";

export interface PayerFixResult {
  applied: boolean;
  fixes: string[];
  adjustedCpt: string;
  modifier?: string;
  documentationAdded: boolean;
  originalRisk: number;
  estimatedNewRisk: number;
}

const PAYER_CPT_DOWNGRADES: Record<string, Record<string, string>> = {
  medicare: { "99215": "99214", "99285": "99284" },
  medicaid: { "99215": "99214", "99285": "99284" },
  bcbs: { "99215": "99214" },
};

export function payerAutoFix(
  cpt: string,
  payer: string,
  prediction: DenialPredictionV2,
  opts?: { complexity?: number; icd10?: string },
): PayerFixResult {
  const fixes: string[] = [];
  let adjustedCpt = cpt;
  let modifier: string | undefined;
  let documentationAdded = false;
  let riskReduction = 0;

  if (prediction.riskScore <= 0.2) {
    return { applied: false, fixes: [], adjustedCpt: cpt, documentationAdded: false, originalRisk: prediction.riskScore, estimatedNewRisk: prediction.riskScore };
  }

  const payerLower = payer.toLowerCase();
  const downgrades = PAYER_CPT_DOWNGRADES[payerLower];
  if (downgrades && downgrades[cpt]) {
    adjustedCpt = downgrades[cpt];
    fixes.push(`CPT downgraded ${cpt}→${adjustedCpt} for ${payer} compliance`);
    riskReduction += 0.15;
  }

  const docFactor = prediction.factors.find((f) => f.factor === "Documentation");
  if (docFactor && docFactor.contribution > 0.05) {
    documentationAdded = true;
    fixes.push("Documentation enhancement flagged — expanded reasoning required");
    riskReduction += 0.10;
  }

  const noteFactor = prediction.factors.find((f) => f.factor === "Note Completeness");
  if (noteFactor && noteFactor.contribution > 0) {
    documentationAdded = true;
    fixes.push("Missing note sections flagged for completion");
    riskReduction += 0.08;
  }

  if (payerLower === "medicare" || payerLower === "bcbs" || payerLower === "medicaid") {
    modifier = "25";
    fixes.push(`Modifier 25 added (${payer} policy)`);
    riskReduction += 0.05;
  }

  if (opts?.icd10 === "R69" && prediction.riskScore > 0.4) {
    fixes.push("CRITICAL: Replace R69 with specific ICD-10 — major denial risk");
    riskReduction += 0.02;
  }

  const estimatedNewRisk = Math.max(0, Math.round((prediction.riskScore - riskReduction) * 1000) / 1000);

  return {
    applied: fixes.length > 0,
    fixes,
    adjustedCpt,
    modifier,
    documentationAdded,
    originalRisk: prediction.riskScore,
    estimatedNewRisk,
  };
}
