export interface DenialPrediction {
  risk: "high" | "low";
  probability: number;
  reasons: string[];
}

export function predictDenial(claim: {
  insurance?: string;
  cpt?: string;
  disposition?: string;
  [key: string]: unknown;
}): DenialPrediction {
  let score = 0;
  const reasons: string[] = [];

  if (!claim.insurance) {
    score += 3;
    reasons.push("Missing insurance");
  }
  if (!claim.cpt) {
    score += 2;
    reasons.push("Missing CPT code");
  }
  if (claim.cpt === "99285" && claim.disposition !== "ER_NOW") {
    score += 2;
    reasons.push("CPT 99285 billed for non-ER disposition");
  }

  return {
    risk: score > 3 ? "high" : "low",
    probability: Math.min(score / 10, 1),
    reasons,
  };
}

export type PayerRoute = "clinic" | "telemed" | "self-pay";

export function routeByPayer(patient: {
  insurance?: string;
  [key: string]: unknown;
}): PayerRoute {
  if (patient.insurance === "Medicaid") return "clinic";
  if (patient.insurance === "Private") return "telemed";
  return "self-pay";
}

export function batchPredictDenials(
  claims: Array<Parameters<typeof predictDenial>[0]>
): DenialPrediction[] {
  return claims.map(predictDenial);
}
