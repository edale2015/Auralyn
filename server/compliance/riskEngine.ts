export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface RiskClassification {
  level: RiskLevel;
  requiresPhysicianReview: boolean;
  requiresAuditTrail: boolean;
  escalationRequired: boolean;
  reason: string;
}

const CRITICAL_DIAGNOSES = ["ACS", "PE", "Stroke", "Meningitis", "Sepsis", "Aortic Dissection", "Ectopic Pregnancy"];

export function classifyRisk(result: {
  triage?: string;
  diagnosis?: string;
  confidence?: number;
}): RiskClassification {
  if (result.triage === "ER" || result.triage === "emergency") {
    return {
      level: "HIGH",
      requiresPhysicianReview: true,
      requiresAuditTrail: true,
      escalationRequired: true,
      reason: `ER-level triage assigned: ${result.diagnosis || "unknown"}`,
    };
  }

  if (result.diagnosis && CRITICAL_DIAGNOSES.includes(result.diagnosis)) {
    return {
      level: "CRITICAL",
      requiresPhysicianReview: true,
      requiresAuditTrail: true,
      escalationRequired: true,
      reason: `Critical diagnosis detected: ${result.diagnosis}`,
    };
  }

  if (result.triage === "urgent") {
    return {
      level: "MEDIUM",
      requiresPhysicianReview: true,
      requiresAuditTrail: true,
      escalationRequired: false,
      reason: `Urgent triage: ${result.diagnosis || "review needed"}`,
    };
  }

  if (result.confidence !== undefined && result.confidence < 0.6) {
    return {
      level: "MEDIUM",
      requiresPhysicianReview: true,
      requiresAuditTrail: true,
      escalationRequired: false,
      reason: `Low confidence (${result.confidence}) — physician verification needed`,
    };
  }

  return {
    level: "LOW",
    requiresPhysicianReview: false,
    requiresAuditTrail: false,
    escalationRequired: false,
    reason: "Routine case within normal parameters",
  };
}

export function validateSafeDischarge(result: {
  triage?: string;
  diagnosis?: string;
}): { safe: boolean; reason?: string } {
  if (
    result.triage === "routine" &&
    result.diagnosis &&
    CRITICAL_DIAGNOSES.includes(result.diagnosis)
  ) {
    return {
      safe: false,
      reason: `SAFETY BLOCK: Cannot discharge ${result.diagnosis} as routine — requires ER evaluation`,
    };
  }
  return { safe: true };
}
