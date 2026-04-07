/**
 * Shared billing types — structured issue codes, severities, and scrub findings.
 *
 * Separating these from claimScrubber.ts lets downstream systems (queues,
 * UI badge renderers, analytics pipelines, audit reports) pattern-match on
 * machine-readable codes rather than parsing free-text strings.
 */

// ── Scrub issue codes ─────────────────────────────────────────────────────────
//
// These are the canonical identifiers for every rejection/warning a claim can
// produce during scrubbing. Add new codes here when expanding scrub coverage.
// Never remove or rename existing codes — treat them like enum values in a DB.

export type ScrubIssueCode =
  | "MISSING_PATIENT_ID"
  | "MISSING_PROVIDER_ID"
  | "INVALID_ICD10_FORMAT"
  | "MISSING_ICD10"
  | "INVALID_CPT_FORMAT"
  | "MISSING_CPT"
  | "MISSING_DOCUMENTATION"
  | "MISSING_PRIOR_AUTH"
  | "MISSING_REQUIRED_MODIFIER"
  | "INVALID_DOS"
  | "FUTURE_DOS"
  | "TIMELY_FILING_RISK";

export type ScrubSeverity = "issue" | "warning";

/**
 * A structured scrub finding.
 *
 * `issue` severity = hard failure — do not submit the claim.
 * `warning` severity = soft flag — submittable but human review recommended.
 *
 * `field` is the ClaimInput key the finding relates to, enabling field-level
 * highlighting in claim review UIs without string parsing.
 * Typed as string to avoid a circular dependency with claimScrubber.ts.
 */
export interface ScrubIssue {
  code:     ScrubIssueCode;
  severity: ScrubSeverity;
  message:  string;
  field?:   string;
}
