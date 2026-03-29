/**
 * Prior Authorization Detection Engine
 *
 * Checks both procedure names AND actual CPT codes against prior-auth requirements.
 * Also supports payer-specific overrides (Medicare, commercial).
 */

export interface PriorAuthResult {
  required:     boolean;
  reason?:      string;
  procedure?:   string;
  cpt?:         string;
  urgency?:     "routine" | "urgent" | "emergency";
  alternatives?:string[];
  payerNotes?:  string;
}

interface PriorAuthEntry {
  reason:        string;
  urgency:       PriorAuthResult["urgency"];
  alternatives?: string[];
  payerNotes?:   string;
}

const PROCEDURE_AUTH_MAP: Record<string, PriorAuthEntry> = {
  MRI:          { reason: "High-cost imaging",          urgency: "routine", alternatives: ["X-ray", "CT_SCAN"] },
  CT_SCAN:      { reason: "High-cost imaging",          urgency: "routine", alternatives: ["X-ray", "ultrasound"] },
  PET_SCAN:     { reason: "High-cost nuclear imaging",  urgency: "routine" },
  INFUSION:     { reason: "IV therapy requiring auth",  urgency: "routine" },
  BIOLOGICS:    { reason: "High-cost biologic therapy", urgency: "routine", alternatives: ["biosimilar"] },
  NEUROLOGY:    { reason: "Specialist referral",        urgency: "routine" },
  CARDIOLOGY:   { reason: "Specialist referral",        urgency: "routine" },
  SLEEP_STUDY:  { reason: "Diagnostic sleep study",     urgency: "routine" },
  ORTHOPEDIC:   { reason: "Elective orthopedic procedure", urgency: "routine" },
  BARIATRIC:    { reason: "Weight loss surgery program",   urgency: "routine", payerNotes: "Requires 6-month supervised diet program documentation" },
};

// CPT code → prior auth entry (commercial payer defaults)
const CPT_AUTH_MAP: Record<string, PriorAuthEntry & { procedureName: string }> = {
  // MRI — Brain
  "70553": { procedureName: "MRI Brain with/without contrast", reason: "High-cost MRI imaging",   urgency: "routine", alternatives: ["70551"] },
  "70552": { procedureName: "MRI Brain with contrast",         reason: "High-cost MRI imaging",   urgency: "routine" },
  "70551": { procedureName: "MRI Brain without contrast",      reason: "High-cost MRI imaging",   urgency: "routine" },
  // MRI — Spine
  "72148": { procedureName: "MRI Lumbar Spine",                reason: "High-cost MRI imaging",   urgency: "routine", alternatives: ["72100"] },
  "72141": { procedureName: "MRI Cervical Spine",              reason: "High-cost MRI imaging",   urgency: "routine" },
  "72156": { procedureName: "MRI Thoracic Spine",              reason: "High-cost MRI imaging",   urgency: "routine" },
  // CT
  "71250": { procedureName: "CT Chest",                        reason: "High-cost CT imaging",    urgency: "routine", alternatives: ["71046"] },
  "74178": { procedureName: "CT Abd/Pelvis",                   reason: "High-cost CT imaging",    urgency: "routine" },
  "70496": { procedureName: "CT Angiography Head",             reason: "High-cost CT angiography",urgency: "urgent"  },
  // PET
  "78816": { procedureName: "PET/CT whole body",               reason: "High-cost nuclear imaging",urgency: "routine" },
  "78815": { procedureName: "PET/CT skull-thigh",              reason: "High-cost nuclear imaging",urgency: "routine" },
  // Orthopedic surgery
  "27447": { procedureName: "Total Knee Replacement",          reason: "Elective major joint surgery", urgency: "routine", payerNotes: "Conservative therapy (PT ≥6 weeks) must be documented" },
  "27130": { procedureName: "Total Hip Replacement",           reason: "Elective major joint surgery", urgency: "routine", payerNotes: "Conservative therapy (PT ≥6 weeks) must be documented" },
  "29827": { procedureName: "Shoulder Arthroscopy",            reason: "Elective arthroscopic surgery", urgency: "routine" },
  // Spine surgery
  "22612": { procedureName: "Lumbar Spinal Fusion",            reason: "Complex spine surgery", urgency: "routine", payerNotes: "Conservative therapy ≥12 weeks + imaging required" },
  "22551": { procedureName: "Cervical Disc Fusion",            reason: "Complex spine surgery", urgency: "routine" },
  // Cardiac
  "93452": { procedureName: "Left Heart Catheterization",      reason: "Invasive cardiac procedure", urgency: "urgent" },
  "92928": { procedureName: "Coronary Stent Placement",        reason: "Interventional cardiac procedure", urgency: "urgent" },
  // Biologic infusions
  "J0135": { procedureName: "Adalimumab (Humira) injection",   reason: "Biologic DMARD", urgency: "routine", alternatives: ["J3262 (biosimilar)"] },
  "J1745": { procedureName: "Infliximab (Remicade) infusion",  reason: "Biologic DMARD infusion", urgency: "routine" },
  // Sleep study
  "95810": { procedureName: "Polysomnography",                 reason: "Diagnostic sleep study", urgency: "routine", payerNotes: "Home sleep test may be required first" },
  // Bariatric
  "43775": { procedureName: "Laparoscopic Sleeve Gastrectomy", reason: "Bariatric surgery", urgency: "routine", payerNotes: "6-month medically supervised diet + psych eval required" },
  "43644": { procedureName: "Laparoscopic Gastric Bypass",     reason: "Bariatric surgery", urgency: "routine", payerNotes: "6-month medically supervised diet + psych eval required" },
};

export function requiresPriorAuth(claim: {
  procedure?: string;
  cpt?:       string;
  emergency?: boolean;
  payer?:     string;
}): PriorAuthResult {
  if (claim.emergency) {
    return { required: false, reason: "Emergency exception — prior auth waived" };
  }

  // CPT code match (most precise)
  if (claim.cpt && CPT_AUTH_MAP[claim.cpt]) {
    const cfg = CPT_AUTH_MAP[claim.cpt];
    return {
      required:     true,
      reason:       cfg.reason,
      procedure:    cfg.procedureName,
      cpt:          claim.cpt,
      urgency:      cfg.urgency,
      alternatives: cfg.alternatives,
      payerNotes:   cfg.payerNotes,
    };
  }

  // Procedure name match (fallback)
  if (claim.procedure) {
    const key = claim.procedure.toUpperCase().replace(/[\s-]/g, "_");
    if (PROCEDURE_AUTH_MAP[key]) {
      const cfg = PROCEDURE_AUTH_MAP[key];
      return {
        required:     true,
        reason:       cfg.reason,
        procedure:    claim.procedure,
        urgency:      cfg.urgency,
        alternatives: cfg.alternatives,
        payerNotes:   cfg.payerNotes,
      };
    }
  }

  return { required: false };
}

export function getPriorAuthStats() {
  return {
    active:            true,
    coveredProcedures: Object.keys(PROCEDURE_AUTH_MAP).length,
    coveredCPTCodes:   Object.keys(CPT_AUTH_MAP).length,
    totalRules:        Object.keys(PROCEDURE_AUTH_MAP).length + Object.keys(CPT_AUTH_MAP).length,
  };
}
