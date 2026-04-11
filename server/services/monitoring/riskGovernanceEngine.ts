export type ClinicalDecisionType =
  | "ANTIBIOTIC"
  | "NO_ANTIBIOTIC"
  | "ANTIBIOTIC_GIVEN"
  | "NO_ANTIBIOTIC_OR_DELAYED"
  | "CONSIDER_ANTIBIOTIC"
  | "TEST_OR_DELAYED_RX";

export interface RiskInput {
  decision: ClinicalDecisionType | string;
  probability: number;
  centorScore?: number;
}

export interface RiskAlert {
  type: "under_treatment" | "over_treatment" | "high_confidence_mismatch";
  message: string;
  severity: "warning" | "critical";
  probability: number;
  decision: string;
}

export function evaluateRisk(input: RiskInput): RiskAlert[] {
  const alerts: RiskAlert[] = [];
  const isNoAntibiotic = ["NO_ANTIBIOTIC", "NO_ANTIBIOTIC_OR_DELAYED"].includes(input.decision);
  const isAntibiotic   = ["ANTIBIOTIC", "ANTIBIOTIC_GIVEN", "CONSIDER_ANTIBIOTIC"].includes(input.decision);

  if (isNoAntibiotic && input.probability > 0.7) {
    alerts.push({
      type: "under_treatment",
      message: "Possible under-treatment risk: high bacterial probability but no antibiotic selected",
      severity: input.probability > 0.85 ? "critical" : "warning",
      probability: input.probability,
      decision: input.decision,
    });
  }

  if (isAntibiotic && input.probability < 0.3) {
    alerts.push({
      type: "over_treatment",
      message: "Possible over-treatment risk: antibiotic selected with low bacterial probability",
      severity: input.probability < 0.15 ? "critical" : "warning",
      probability: input.probability,
      decision: input.decision,
    });
  }

  if (input.centorScore !== undefined && input.centorScore >= 4 && isNoAntibiotic) {
    alerts.push({
      type: "high_confidence_mismatch",
      message: "Centor score ≥4 suggests empiric treatment but no antibiotic was selected",
      severity: "warning",
      probability: input.probability,
      decision: input.decision,
    });
  }

  return alerts;
}
