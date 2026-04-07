import { scrubClaim, type ScrubResult } from "./claimScrubber";
import { requiresPriorAuth } from "./priorAuth";
import { validateModifier } from "./modifierEngine";
import { detectHCCs } from "./hccCapture";
import { logSecureEvent } from "../ops/secureAudit";

// ── Three-state outcome ───────────────────────────────────────────────────────
//
// FIXED: the original binary `approved: boolean` merged two meaningfully
// different outcomes into one:
//   approved=true   → no issues AND no warnings (safe to submit)
//   approved=true   → no hard issues but warnings present (high-risk submit)
//
// "Warnings only" is a distinct billing state. A claim that "usually requires
// prior authorization" should not be submitted without human review, yet the
// old binary approved=true allowed that. The new three-state model:
//   "approved"               → no issues, no warnings — submit
//   "approved_with_warnings" → no hard failures, human review recommended
//   "rejected"               → hard issues present — do not submit

export type PreSubmissionStatus =
  | "approved"               // clean — submit
  | "approved_with_warnings" // submittable but requires human review
  | "rejected";              // hard issues — must not submit

export interface PreSubmissionResult {
  status:              PreSubmissionStatus;
  submittable:         boolean;           // true for approved + approved_with_warnings
  requiresHumanReview: boolean;           // true whenever status !== "approved"
  scrub:               ScrubResult;
  priorAuth:           { required: boolean; reason?: string; procedure?: string };
  modifier:            { valid: boolean; reason?: string; risk?: string };
  hcc:                 { captureCount: number; totalEstimatedUplift: number };
  issues:              string[];          // flat string list for backward compat
  recommendation:      string;
  checkedAt:           string;
}

export function preSubmitCheck(claim: {
  icd10?:          string;
  cpt?:            string;
  documentation?:  boolean;
  modifier?:       string;
  separateService?: boolean;
  procedure?:      string;
  emergency?:      boolean;
  symptoms?:       string[];
  history?:        string[];
  patientId?:      string;
  provider?:       string;
  dateOfService?:  string;
  priorAuthRef?:   string;
  modifiers?:      string[];
}): PreSubmissionResult {
  const scrub    = scrubClaim(claim);
  const auth     = requiresPriorAuth(claim);
  const modifier = validateModifier(claim);
  const hcc      = detectHCCs(claim.symptoms ?? [], claim.history ?? []);

  const issues: string[] = [
    ...scrub.issues.map(i => i.message),
    ...(auth.required ? [`Prior auth required: ${auth.reason}`] : []),
    ...(modifier.valid ? [] : [`Modifier issue: ${modifier.reason}`]),
  ];

  // Three-state status derivation
  const hasHardIssues = !scrub.valid || !modifier.valid || auth.required;
  const hasSoftWarnings =
    scrub.warnings.length > 0 ||
    (!scrub.valid && scrub.status === "warnings_only");

  const status: PreSubmissionStatus =
    hasHardIssues    ? "rejected"               :
    hasSoftWarnings  ? "approved_with_warnings"  :
    "approved";

  const submittable         = status !== "rejected";
  const requiresHumanReview = status !== "approved";

  let recommendation = "";
  if (status === "rejected") {
    if (!scrub.valid)    recommendation += "Fix claim fields. ";
    if (auth.required)   recommendation += "Obtain prior authorization before submission. ";
    if (!modifier.valid) recommendation += "Correct modifier usage. ";
  } else if (status === "approved_with_warnings") {
    recommendation = "Claim has warnings — human review recommended before submission.";
    if (scrub.warnings.length > 0) {
      recommendation += ` Warnings: ${scrub.warnings.map(w => w.message).join("; ")}`;
    }
  } else {
    recommendation = "Claim passes pre-submission checks.";
    if (hcc.captureCount > 0) {
      recommendation += ` HCC capture opportunity: +$${hcc.totalEstimatedUplift.toFixed(0)} estimated uplift.`;
    }
  }

  const result: PreSubmissionResult = {
    status,
    submittable,
    requiresHumanReview,
    scrub,
    priorAuth: auth,
    modifier,
    hcc: { captureCount: hcc.captureCount, totalEstimatedUplift: hcc.totalEstimatedUplift },
    issues,
    recommendation,
    checkedAt: new Date().toISOString(),
  };

  if (!submittable) {
    logSecureEvent({ type: "CLAIM_PRE_SUBMISSION_FAILED", issues, cpt: claim.cpt });
  }

  return result;
}

export function getPreSubmissionStats() {
  return {
    active: true,
    checks: ["scrub", "prior_auth", "modifier", "hcc_capture"],
    stages: 4,
  };
}
