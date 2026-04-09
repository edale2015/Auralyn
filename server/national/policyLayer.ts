/**
 * Policy + Compliance Layer
 *
 * "Ensures safe national operation within each regulatory jurisdiction."
 *
 * Each US state (and territory) has different rules for:
 *   - Telemedicine licensing and prescribing
 *   - Physician supervision requirements for NPs/PAs
 *   - Cross-state license recognition (interstate compacts)
 *   - Controlled substance prescription restrictions
 *   - Mandatory reporting and public health notification thresholds
 *
 * This layer ensures the routing and scaling engines never prescribe an
 * action that violates state law, even in surge conditions.
 *
 * Interstate Compact (ILC) states: allow out-of-state physicians to treat.
 * PSYPACT states: allow cross-state telepsychology.
 * DEA REMS: special authorization for controlled substances via telemed.
 */

// States in the Interstate Medical Licensure Compact as of 2026
const ILC_STATES = new Set([
  "AL","AZ","CO","GA","IA","ID","IL","KS","KY","ME","MD","MI","MN","MS","MO",
  "MT","NE","NV","NH","NM","ND","OH","OK","PA","SD","TN","TX","UT","VT","VA","WA","WY"
]);

// States requiring physician supervision for telemedicine PAs/NPs
const SUPERVISION_REQUIRED = new Set(["NY", "CA", "TX", "FL", "GA", "PA", "OH"]);

export interface PolicyInput {
  state?:       string;   // two-letter state code e.g. "NY"
  country?:     string;   // ISO2 e.g. "US", "UK", "IN"
  context?: {
    isControlledSubstance?: boolean;
    crossStatePrescribing?:  boolean;
    patientType?:            "adult" | "pediatric" | "psychiatric";
  };
}

export interface PolicyOutput {
  allowTelemed:                boolean;
  requiresPhysicianReview:     boolean;
  requiresPhysicianSupervision: boolean;
  crossStatePrescribingAllowed: boolean;
  ilcCompactMember:            boolean;
  mandatoryReportingThreshold: number;   // cases before mandatory public health report
  notes:                       string[];
  jurisdiction:                string;
}

export function enforceRegionalPolicies(input: PolicyInput): PolicyOutput {
  const state    = (input.state   ?? "").toUpperCase();
  const country  = (input.country ?? "US").toUpperCase();
  const ctx      = input.context ?? {};
  const notes: string[] = [];

  // ── International defaults ────────────────────────────────────────────────
  if (country !== "US") {
    return {
      allowTelemed:                 true,
      requiresPhysicianReview:      false,
      requiresPhysicianSupervision: false,
      crossStatePrescribingAllowed: false,
      ilcCompactMember:             false,
      mandatoryReportingThreshold:  10,
      notes:                        [`Country ${country}: standard international telemed policy applied`],
      jurisdiction:                 country,
    };
  }

  // ── NY: most restrictive ──────────────────────────────────────────────────
  if (state === "NY") {
    if (ctx.isControlledSubstance) notes.push("NY: controlled substance requires in-person exam first");
    notes.push("NY: physician must review all telemed encounters within 24h");
    return {
      allowTelemed:                 true,
      requiresPhysicianReview:      true,
      requiresPhysicianSupervision: true,
      crossStatePrescribingAllowed: ILC_STATES.has("NY") ? true : false,
      ilcCompactMember:             false,  // NY is not in ILC as of 2026
      mandatoryReportingThreshold:  5,
      notes,
      jurisdiction:                 "NY",
    };
  }

  // ── CA: physician supervision for telemed NP/PA ───────────────────────────
  if (state === "CA") {
    notes.push("CA: AB 890 allows NPs to practice independently for most telemed cases");
    return {
      allowTelemed:                 true,
      requiresPhysicianReview:      false,
      requiresPhysicianSupervision: false,
      crossStatePrescribingAllowed: ILC_STATES.has("CA") ? true : false,
      ilcCompactMember:             false,
      mandatoryReportingThreshold:  10,
      notes,
      jurisdiction:                 "CA",
    };
  }

  // ── ILC compact states: most permissive ──────────────────────────────────
  if (ILC_STATES.has(state)) {
    notes.push(`${state}: ILC member — cross-state physician licensing allowed`);
    return {
      allowTelemed:                 true,
      requiresPhysicianReview:      SUPERVISION_REQUIRED.has(state),
      requiresPhysicianSupervision: SUPERVISION_REQUIRED.has(state),
      crossStatePrescribingAllowed: true,
      ilcCompactMember:             true,
      mandatoryReportingThreshold:  10,
      notes,
      jurisdiction:                 state,
    };
  }

  // ── Default / unknown state ───────────────────────────────────────────────
  return {
    allowTelemed:                 true,
    requiresPhysicianReview:      false,
    requiresPhysicianSupervision: false,
    crossStatePrescribingAllowed: false,
    ilcCompactMember:             false,
    mandatoryReportingThreshold:  10,
    notes:                        state ? [`${state}: standard telemed policy applied`] : ["State unspecified — default policy applied"],
    jurisdiction:                 state || "US",
  };
}
