import { getIntendedUseSummary } from "./intendedUse";

export interface FDAComplianceProfile {
  intendedUse: string;
  classification: string;
  regulatoryPathway: string;
  standard: string;
  humanFactorsValidated: boolean;
  requiresSubmission: boolean;
  postMarketSurveillance: boolean;
  softwareLifecycleStandard: string;
  cybersecurityGuidance: string;
  riskManagementStandard: string;
  dataPrivacyCompliance: string[];
  auditReadiness: boolean;
}

export const FDA_PROFILE: FDAComplianceProfile = {
  intendedUse:               "Assist licensed clinicians in triage and disposition decisions — not a replacement for physician judgment",
  classification:            "SaMD Class II",
  regulatoryPathway:         "510(k) Premarket Notification",
  standard:                  "IEC 62304 (Medical Device Software Lifecycle)",
  humanFactorsValidated:     false,
  requiresSubmission:        true,
  postMarketSurveillance:    true,
  softwareLifecycleStandard: "IEC 62304",
  cybersecurityGuidance:     "FDA Cybersecurity in Medical Devices (2023)",
  riskManagementStandard:    "ISO 14971:2019",
  dataPrivacyCompliance:     ["HIPAA", "HITECH", "21 CFR Part 11"],
  auditReadiness:            true,
};

export interface ComplianceCheckResult {
  compliant: boolean;
  gaps: string[];
  score: number;
  readinessLevel: "red" | "yellow" | "green";
}

export function runComplianceCheck(): ComplianceCheckResult {
  const gaps: string[] = [];

  if (!FDA_PROFILE.humanFactorsValidated)    gaps.push("Human factors study not yet validated (required for 510k submission)");
  if (!FDA_PROFILE.requiresSubmission)       gaps.push("Submission pathway not declared");
  if (!FDA_PROFILE.postMarketSurveillance)   gaps.push("Post-market surveillance plan not established");

  const score   = Math.max(0, 100 - gaps.length * 20);
  const readinessLevel: ComplianceCheckResult["readinessLevel"] =
    score >= 80 ? "green" : score >= 60 ? "yellow" : "red";

  return { compliant: gaps.length === 0, gaps, score, readinessLevel };
}

export function getFullComplianceReport() {
  const intendedUseSummary = getIntendedUseSummary();
  const check = runComplianceCheck();
  return {
    profile:      FDA_PROFILE,
    intendedUse:  intendedUseSummary,
    check,
    reportedAt:   new Date().toISOString(),
  };
}

export function getComplianceStats() {
  const check = runComplianceCheck();
  return {
    active:            true,
    classification:    FDA_PROFILE.classification,
    standard:          FDA_PROFILE.standard,
    readinessScore:    check.score,
    readinessLevel:    check.readinessLevel,
    openGaps:          check.gaps.length,
  };
}
