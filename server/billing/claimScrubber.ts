/**
 * Claim Scrubber — validates a claim object before submission.
 *
 * Performs:
 * - Required field checks (ICD-10, CPT)
 * - High-acuity documentation requirement (CPT 99285)
 * - Modifier + procedure mismatch detection
 * - Prior-auth flag check
 * - Date of service sanity check (not in the future)
 */

export interface ClaimInput {
  icd10?:         string;
  cpt?:           string;
  documentation?: string;
  modifiers?:     string[];
  priorAuthRef?:  string;
  dateOfService?: string;
  payerId?:       string;
  patientId?:     string;
  provider?:      string;
}

export interface ScrubResult {
  valid:  boolean;
  issues: string[];
  warnings: string[];
}

/** CPTs that require prior-auth with common commercial payers */
const PRIOR_AUTH_REQUIRED_CPTS = new Set([
  "99285", "99283", "99291", "27447", "27130", "22612",
]);

/** CPT → required modifier (simplified subset) */
const MODIFIER_REQUIRED: Record<string, string> = {
  "99291": "GC", // critical care — requires supervision modifier
};

export function scrubClaim(claim: ClaimInput): ScrubResult {
  const issues:   string[] = [];
  const warnings: string[] = [];

  // Required fields
  if (!claim.icd10)  issues.push("Missing diagnosis code (ICD-10)");
  if (!claim.cpt)    issues.push("Missing procedure code (CPT)");
  if (!claim.patientId) issues.push("Missing patient ID");
  if (!claim.provider)  warnings.push("No provider specified");

  // High-acuity documentation
  if (claim.cpt === "99285" && !claim.documentation) {
    issues.push("CPT 99285 (high-acuity ED) requires supporting documentation");
  }

  // Required modifier check
  if (claim.cpt && MODIFIER_REQUIRED[claim.cpt]) {
    const required = MODIFIER_REQUIRED[claim.cpt];
    if (!(claim.modifiers ?? []).includes(required)) {
      warnings.push(`CPT ${claim.cpt} typically requires modifier ${required}`);
    }
  }

  // Prior auth flag
  if (claim.cpt && PRIOR_AUTH_REQUIRED_CPTS.has(claim.cpt) && !claim.priorAuthRef) {
    warnings.push(
      `CPT ${claim.cpt} usually requires prior authorization — no priorAuthRef provided`
    );
  }

  // Date sanity
  if (claim.dateOfService) {
    const dos = new Date(claim.dateOfService);
    if (isNaN(dos.getTime())) {
      issues.push(`Invalid dateOfService: "${claim.dateOfService}"`);
    } else if (dos > new Date()) {
      issues.push("dateOfService is in the future");
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    warnings,
  };
}

/**
 * Scrub + throw if the claim is invalid.
 * Useful in pipeline code where a bad claim should halt processing.
 */
export function scrubClaimOrThrow(claim: ClaimInput): ScrubResult {
  const result = scrubClaim(claim);
  if (!result.valid) {
    throw new Error(`Claim scrub failed: ${result.issues.join("; ")}`);
  }
  return result;
}
