/**
 * Payer-Specific Claim Adjustment Rules
 *
 * Applies payer-specific business rules on top of the base claim scrubber.
 * Each payer can define:
 *   - Documentation requirements
 *   - CPT modifiers
 *   - Prior-auth requirements
 *   - Claim-level adjustments (rate, bundle, etc.)
 *
 * Designed to be composed with claimScrubber.ts and hccEngine.ts.
 */

export interface PayerAdjustmentResult {
  valid:       boolean;
  reason?:     string;
  adjustments: string[];
  warnings:    string[];
}

export interface ClaimForAdjustment {
  cpt?:             string;
  icd10?:           string;
  documentation?:   string;
  modifiers?:       string[];
  priorAuthRef?:    string;
  dateOfService?:   string;
  hccMatches?:      string[];
  rafScore?:        number;
}

type PayerAdjustmentFn = (claim: ClaimForAdjustment) => PayerAdjustmentResult;

const PAYER_RULES: Record<string, PayerAdjustmentFn> = {
  medicare: (claim) => {
    const adjustments: string[] = [];
    const warnings:    string[] = [];

    if (!claim.documentation) {
      return { valid: false, reason: "Medicare requires clinical documentation for all claims", adjustments, warnings };
    }

    // Medicare requires modifier 25 for E&M same-day as procedure
    if (claim.cpt?.startsWith("99") && !(claim.modifiers ?? []).includes("25")) {
      warnings.push("Consider modifier 25 for same-day E&M + procedure billing");
    }

    // Medicare Advantage RAF uplift
    if (claim.rafScore !== undefined && claim.rafScore > 1.5) {
      adjustments.push(`High RAF score (${claim.rafScore}) — eligible for risk-adjusted payment uplift`);
    }

    return { valid: true, adjustments, warnings };
  },

  medicaid: (claim) => {
    const adjustments: string[] = [];
    const warnings:    string[] = [];

    if (!claim.priorAuthRef && ["99285", "27447", "27130"].includes(claim.cpt ?? "")) {
      warnings.push("Medicaid requires prior authorization for this CPT");
    }

    adjustments.push("Medicaid FQHC encounter rate may apply — verify facility type");
    return { valid: true, adjustments, warnings };
  },

  "bcbs-ny": (claim) => {
    const adjustments: string[] = [];
    const warnings:    string[] = [];

    if (claim.cpt === "99285" && !claim.documentation) {
      return { valid: false, reason: "BCBS-NY requires documentation for CPT 99285", adjustments, warnings };
    }

    adjustments.push("BCBS-NY value-based contract — quality bonus eligible if HEDIS measure met");
    return { valid: true, adjustments, warnings };
  },

  aetna: (claim) => {
    const adjustments: string[] = [];
    const warnings:    string[] = [];
    warnings.push("Aetna: verify network tier — out-of-network reimbursement reduced by 40%");
    return { valid: true, adjustments, warnings };
  },

  unitedhealth: (claim) => {
    const adjustments: string[] = [];
    const warnings:    string[] = [];
    if (claim.hccMatches?.length) {
      adjustments.push("UnitedHealth: HCC diagnosis coding may qualify for risk revenue uplift");
    }
    return { valid: true, adjustments, warnings };
  },
};

const DEFAULT_RULE: PayerAdjustmentFn = (claim) => {
  const warnings: string[] = [];
  if (!claim.documentation) warnings.push("Documentation recommended for all commercial claims");
  return { valid: true, adjustments: [], warnings };
};

/**
 * Apply payer-specific rules to a claim.
 * Returns an adjustment result (may include invalid claims for certain payers).
 */
export function payerSpecificAdjustments(
  claim: ClaimForAdjustment,
  payer: string
): PayerAdjustmentResult {
  const fn = PAYER_RULES[payer.toLowerCase()] ?? DEFAULT_RULE;
  return fn(claim);
}

export function listSupportedPayers(): string[] {
  return Object.keys(PAYER_RULES);
}
