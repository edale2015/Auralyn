/**
 * Claim Scrubber — validates a claim object before submission.
 *
 * Fixed in this version:
 *  - ICD-10 and CPT codes are now format-validated with strict regex
 *    (previously any string passed — "ABC", "1", "HEART ATTACK" all got through)
 *  - Date-of-service is strictly parsed as YYYY-MM-DD with a round-trip check
 *    that catches non-existent dates like "2024-02-30" and bare years like "2024"
 *  - Documentation requirement extended beyond just CPT 99285 to cover all
 *    high-acuity ED and critical care codes
 *  - Provider is now a hard issue (not a warning) — billing without a provider
 *    is a guaranteed rejection
 *  - Three-state ScrubStatus replaces the binary approved boolean:
 *      "clean"          → no issues, no warnings — submit
 *      "warnings_only"  → no hard failures, human review recommended
 *      "invalid"        → hard failures present — do not submit
 */

import type { ScrubIssue } from "./billingTypes";

export type { ScrubIssue };

export interface ClaimInput {
  icd10?:          string;
  cpt?:            string;
  documentation?:  string;
  modifiers?:      string[];
  priorAuthRef?:   string;
  dateOfService?:  string;  // Required format: YYYY-MM-DD
  payerId?:        string;
  patientId?:      string;
  provider?:       string;
}

export type ScrubStatus = "clean" | "warnings_only" | "invalid";

export interface ScrubResult {
  status:   ScrubStatus;
  valid:    boolean;        // true only when no hard issues (warnings OK)
  issues:   ScrubIssue[];  // structured — use .code for machine-readable matching
  warnings: ScrubIssue[];  // structured soft flags
}

// ── Validation constants ──────────────────────────────────────────────────────

/**
 * ICD-10-CM: one letter + two digits + optional dot + 1-4 alphanumeric chars.
 * Valid: A01, A01.1, Z23, M54.51, S72.001A
 * Invalid: ABC, 123, A1, A012345
 *
 * Note: this validates FORMAT only — not whether the code is active in the
 * current code set or valid for the encounter year. Code-set validation
 * requires an external lookup service.
 */
const ICD10_REGEX = /^[A-Z][0-9]{2}(\.[A-Z0-9]{1,4})?$/;

/**
 * CPT codes are 5-digit numeric strings (HCPCS Level II letter-prefix codes
 * are excluded for now).
 */
const CPT_REGEX = /^[0-9]{5}$/;

/**
 * Strict ISO 8601 date: YYYY-MM-DD only.
 * Rejects "Feb 30 2024", "2024", "2024-13-01", and locale-formatted strings.
 */
const ISO_DATE_REGEX = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/**
 * CPTs that require documentation in the clinical note before submission.
 * FIXED: original enforced this only for 99285. 99284, 99291 also require it.
 */
const DOCUMENTATION_REQUIRED_CPTS = new Set([
  "99284",  // high-acuity ED
  "99285",  // high-acuity ED (level 5)
  "99291",  // critical care, first hour
]);

/** CPTs that commonly require prior authorization with commercial payers. */
const PRIOR_AUTH_REQUIRED_CPTS = new Set([
  "99285", "99283", "99291",  // high-acuity ED / critical care
  "27447", "27130", "22612",  // surgical
]);

/** CPT → required modifier (simplified subset). */
const MODIFIER_REQUIRED: Record<string, string> = {
  "99291": "GC",  // critical care: supervising physician modifier
};

// ── Safe date parsing ─────────────────────────────────────────────────────────

/**
 * Strictly parses a date string.
 *
 * Returns a Date only if:
 *   1. The string matches YYYY-MM-DD exactly
 *   2. The parsed date components round-trip back to the same values
 *      (catches "2024-02-30" which V8 silently shifts to Mar 1)
 *
 * FIXED: original used `new Date(string)` which accepts:
 *   "2024"       → Jan 1 2024 (plausible date, clearly not a DOS)
 *   "Feb 30 2024"→ Mar 1 in V8 (shifted date silently passes)
 *   "2024-13-01" → Jan 1 2025 in some environments
 */
function parseStrictDate(dateStr: string): Date | null {
  if (!ISO_DATE_REGEX.test(dateStr)) return null;

  const [year, month, day] = dateStr.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear()  !== year  ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate()      !== day
  ) {
    return null;
  }
  return parsed;
}

// ── Main scrubber ─────────────────────────────────────────────────────────────

export function scrubClaim(claim: ClaimInput): ScrubResult {
  const hardIssues: ScrubIssue[] = [];
  const softWarns:  ScrubIssue[] = [];

  // ── Required fields ────────────────────────────────────────────────────────
  if (!claim.patientId?.trim()) {
    hardIssues.push({
      code: "MISSING_PATIENT_ID", severity: "issue", field: "patientId",
      message: "Missing patient ID — claim cannot be submitted without a patient identifier",
    });
  }

  // FIXED: provider was a warning in original — a billing NPI is required
  if (!claim.provider?.trim()) {
    hardIssues.push({
      code: "MISSING_PROVIDER_ID", severity: "issue", field: "provider",
      message: "Missing provider — billing NPI or provider ID is required",
    });
  }

  // ── ICD-10 validation ──────────────────────────────────────────────────────
  if (!claim.icd10?.trim()) {
    hardIssues.push({
      code: "MISSING_ICD10", severity: "issue", field: "icd10",
      message: "Missing diagnosis code (ICD-10)",
    });
  } else {
    const normalized = claim.icd10.trim().toUpperCase();
    if (!ICD10_REGEX.test(normalized)) {
      hardIssues.push({
        code: "INVALID_ICD10_FORMAT", severity: "issue", field: "icd10",
        message:
          `Invalid ICD-10 format: "${claim.icd10}". ` +
          `Expected: letter + 2 digits + optional .1-4 chars (e.g. A01.1, M54.51, S72.001A)`,
      });
    }
  }

  // ── CPT validation ─────────────────────────────────────────────────────────
  if (!claim.cpt?.trim()) {
    hardIssues.push({
      code: "MISSING_CPT", severity: "issue", field: "cpt",
      message: "Missing procedure code (CPT)",
    });
  } else {
    const cpt = claim.cpt.trim();
    if (!CPT_REGEX.test(cpt)) {
      hardIssues.push({
        code: "INVALID_CPT_FORMAT", severity: "issue", field: "cpt",
        message: `Invalid CPT format: "${claim.cpt}". Expected 5-digit numeric code (e.g. 99213)`,
      });
    } else {
      // Documentation — FIXED: extended from 99285-only to full set
      if (DOCUMENTATION_REQUIRED_CPTS.has(cpt) && !claim.documentation?.trim()) {
        hardIssues.push({
          code: "MISSING_DOCUMENTATION", severity: "issue", field: "documentation",
          message:
            `CPT ${cpt} requires supporting documentation. ` +
            `Attach clinical notes before submission.`,
        });
      }

      // Modifier
      if (MODIFIER_REQUIRED[cpt]) {
        const required = MODIFIER_REQUIRED[cpt];
        if (!(claim.modifiers ?? []).includes(required)) {
          softWarns.push({
            code: "MISSING_REQUIRED_MODIFIER", severity: "warning", field: "modifiers",
            message: `CPT ${cpt} typically requires modifier ${required} — verify before submitting`,
          });
        }
      }

      // Prior auth
      if (PRIOR_AUTH_REQUIRED_CPTS.has(cpt) && !claim.priorAuthRef?.trim()) {
        softWarns.push({
          code: "MISSING_PRIOR_AUTH", severity: "warning", field: "priorAuthRef",
          message:
            `CPT ${cpt} usually requires prior authorization. ` +
            `Missing priorAuthRef — high denial risk without it.`,
        });
      }
    }
  }

  // ── Date of service ────────────────────────────────────────────────────────
  if (!claim.dateOfService?.trim()) {
    hardIssues.push({
      code: "INVALID_DOS", severity: "issue", field: "dateOfService",
      message: "Missing dateOfService",
    });
  } else {
    const parsed = parseStrictDate(claim.dateOfService.trim());
    if (!parsed) {
      hardIssues.push({
        code: "INVALID_DOS", severity: "issue", field: "dateOfService",
        message:
          `Invalid dateOfService: "${claim.dateOfService}". ` +
          `Required format: YYYY-MM-DD (e.g. 2024-03-15). ` +
          `Non-existent dates (e.g. Feb 30) and bare years are rejected.`,
      });
    } else {
      const today = new Date();
      today.setUTCHours(23, 59, 59, 999);  // allow same-day submission
      if (parsed > today) {
        hardIssues.push({
          code: "FUTURE_DOS", severity: "issue", field: "dateOfService",
          message: `dateOfService is in the future: "${claim.dateOfService}"`,
        });
      } else {
        // Timely filing: most payers limit to 90-365 days
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        if (parsed < oneYearAgo) {
          softWarns.push({
            code: "TIMELY_FILING_RISK", severity: "warning", field: "dateOfService",
            message:
              `dateOfService "${claim.dateOfService}" is more than 1 year ago. ` +
              `Most payers have timely filing limits of 90-365 days — verify eligibility.`,
          });
        }
      }
    }
  }

  const status: ScrubStatus =
    hardIssues.length > 0 ? "invalid" :
    softWarns.length  > 0 ? "warnings_only" :
    "clean";

  return {
    status,
    valid:    hardIssues.length === 0,
    issues:   hardIssues,
    warnings: softWarns,
  };
}

/**
 * Scrub + throw if the claim has any hard issues.
 * Useful in pipeline code where a bad claim should halt processing.
 */
export function scrubClaimOrThrow(claim: ClaimInput): ScrubResult {
  const result = scrubClaim(claim);
  if (!result.valid) {
    throw new Error(
      `Claim scrub failed: ${result.issues.map(i => `[${i.code}] ${i.message}`).join("; ")}`
    );
  }
  return result;
}
