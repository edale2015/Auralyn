const CRITICAL_DIAGNOSES = ["ACS", "PE", "Stroke", "Meningitis", "Sepsis", "Aortic Dissection", "Ectopic Pregnancy"];

export interface RiskControlResult {
  blocked: boolean;
  requiresPhysicianReview: boolean;
  reason?: string;
  appliedControls: string[];
}

export function enforceRiskControls(result: {
  triage?: string;
  diagnosis?: string;
  confidence?: number;
}): RiskControlResult & Record<string, any> {
  const appliedControls: string[] = [];
  let blocked = false;
  let requiresPhysicianReview = false;
  let reason: string | undefined;

  if (
    result.triage === "routine" &&
    result.diagnosis &&
    CRITICAL_DIAGNOSES.includes(result.diagnosis)
  ) {
    blocked = true;
    reason = `SAFETY BLOCK: Unsafe discharge prevented — ${result.diagnosis} cannot be triaged as routine`;
    appliedControls.push("critical_diagnosis_block");
  }

  if (result.triage === "ER" || result.triage === "emergency") {
    requiresPhysicianReview = true;
    appliedControls.push("er_physician_review");
  }

  if (result.confidence !== undefined && result.confidence < 0.6) {
    requiresPhysicianReview = true;
    appliedControls.push("low_confidence_review");
  }

  if (result.diagnosis && CRITICAL_DIAGNOSES.includes(result.diagnosis)) {
    requiresPhysicianReview = true;
    appliedControls.push("critical_diagnosis_review");
  }

  return {
    ...result,
    blocked,
    requiresPhysicianReview,
    reason,
    appliedControls,
  };
}
