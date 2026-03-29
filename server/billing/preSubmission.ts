import { scrubClaim } from "./claimScrubber";
import { requiresPriorAuth } from "./priorAuth";
import { validateModifier } from "./modifierEngine";
import { detectHCCs } from "./hccCapture";
import { logSecureEvent } from "../ops/secureAudit";

export interface PreSubmissionResult {
  approved: boolean;
  scrub: { valid: boolean; issues: string[] };
  priorAuth: { required: boolean; reason?: string; procedure?: string };
  modifier: { valid: boolean; reason?: string; risk?: string };
  hcc: { captureCount: number; totalEstimatedUplift: number };
  issues: string[];
  recommendation: string;
  checkedAt: string;
}

export function preSubmitCheck(claim: {
  icd10?: string;
  cpt?: string;
  documentation?: boolean;
  modifier?: string;
  separateService?: boolean;
  procedure?: string;
  emergency?: boolean;
  symptoms?: string[];
  history?: string[];
}): PreSubmissionResult {
  const scrub    = scrubClaim(claim);
  const auth     = requiresPriorAuth(claim);
  const modifier = validateModifier(claim);
  const hcc      = detectHCCs(claim.symptoms ?? [], claim.history ?? []);

  const issues: string[] = [
    ...scrub.issues,
    ...(auth.required ? [`Prior auth required: ${auth.reason}`] : []),
    ...(modifier.valid ? [] : [`Modifier issue: ${modifier.reason}`]),
  ];

  const approved = scrub.valid && modifier.valid && !auth.required;

  let recommendation = "";
  if (!approved) {
    if (!scrub.valid)    recommendation += "Fix claim fields. ";
    if (auth.required)   recommendation += "Obtain prior authorization before submission. ";
    if (!modifier.valid) recommendation += "Correct modifier usage. ";
  } else {
    recommendation = "Claim passes pre-submission checks.";
    if (hcc.captureCount > 0) {
      recommendation += ` HCC capture opportunity: +$${hcc.totalEstimatedUplift.toFixed(0)} estimated uplift.`;
    }
  }

  const result: PreSubmissionResult = {
    approved,
    scrub,
    priorAuth: auth,
    modifier,
    hcc: { captureCount: hcc.captureCount, totalEstimatedUplift: hcc.totalEstimatedUplift },
    issues,
    recommendation,
    checkedAt: new Date().toISOString(),
  };

  if (!approved) {
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
