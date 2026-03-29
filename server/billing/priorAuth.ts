export interface PriorAuthResult {
  required: boolean;
  reason?: string;
  procedure?: string;
  urgency?: "routine" | "urgent" | "emergency";
  alternatives?: string[];
}

const PRIOR_AUTH_PROCEDURES: Record<string, { reason: string; urgency: PriorAuthResult["urgency"]; alternatives?: string[] }> = {
  MRI:        { reason: "High-cost imaging",          urgency: "routine", alternatives: ["X-ray", "CT_SCAN"] },
  CT_SCAN:    { reason: "High-cost imaging",          urgency: "routine", alternatives: ["X-ray", "ultrasound"] },
  PET_SCAN:   { reason: "High-cost nuclear imaging",  urgency: "routine" },
  INFUSION:   { reason: "IV therapy requiring auth",  urgency: "routine" },
  BIOLOGICS:  { reason: "High-cost biologic therapy", urgency: "routine", alternatives: ["biosimilar"] },
  NEUROLOGY:  { reason: "Specialist referral",        urgency: "routine" },
  CARDIOLOGY: { reason: "Specialist referral",        urgency: "routine" },
  SLEEP_STUDY:{ reason: "Diagnostic sleep study",     urgency: "routine" },
};

export function requiresPriorAuth(claim: {
  procedure?: string;
  cpt?: string;
  emergency?: boolean;
}): PriorAuthResult {
  if (claim.emergency) {
    return { required: false, reason: "Emergency exception applies" };
  }

  const procedure = (claim.procedure ?? claim.cpt ?? "").toUpperCase();

  if (PRIOR_AUTH_PROCEDURES[procedure]) {
    const cfg = PRIOR_AUTH_PROCEDURES[procedure];
    return {
      required: true,
      reason: cfg.reason,
      procedure,
      urgency: cfg.urgency,
      alternatives: cfg.alternatives,
    };
  }

  return { required: false };
}

export function getPriorAuthStats() {
  return {
    active: true,
    coveredProcedures: Object.keys(PRIOR_AUTH_PROCEDURES).length,
  };
}
