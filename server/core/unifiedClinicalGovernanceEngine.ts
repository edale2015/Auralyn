export type UnifiedClinicalGovernanceInput = {
  contradictionHasErrors?: boolean;
  safetyOverrideDisposition?: string | null;
  severityLevel?: string;
  protocolVarianceSeverity?: string;
  diagnosticDriftLevel?: string;
  physicianRequired?: boolean;
  guidelinePassed?: boolean;
  completenessPassed?: boolean;
};

export type UnifiedClinicalGovernanceOutput = {
  supervisorDecision: "APPROVE" | "NEEDS_PHYSICIAN_REVIEW" | "BLOCK";
  reasons: string[];
};

export function unifiedClinicalGovernanceEngine(
  input: UnifiedClinicalGovernanceInput
): UnifiedClinicalGovernanceOutput {
  const reasons: string[] = [];

  // Hard block — contradiction is a data integrity issue
  if (input.contradictionHasErrors) {
    reasons.push("Contradiction errors present — data integrity issue");
    return { supervisorDecision: "BLOCK", reasons };
  }

  // Safety override already set to emergency
  if (input.safetyOverrideDisposition === "er_now" || input.safetyOverrideDisposition === "ER_NOW") {
    reasons.push("Safety override requires emergency escalation — auto-approve ER routing");
    return { supervisorDecision: "APPROVE", reasons };
  }

  // Critical severity always proceeds but requires physician oversight downstream
  if (input.severityLevel === "critical") {
    reasons.push("Critical severity — emergency pathway approved");
    return { supervisorDecision: "APPROVE", reasons };
  }

  // Major protocol variance — needs eyes on it
  if (input.protocolVarianceSeverity === "major") {
    reasons.push("Major protocol variance detected");
    return { supervisorDecision: "NEEDS_PHYSICIAN_REVIEW", reasons };
  }

  // Major diagnostic drift — clinical story changed significantly
  if (input.diagnosticDriftLevel === "major") {
    reasons.push("Major diagnostic drift — top diagnosis shifted substantially");
    return { supervisorDecision: "NEEDS_PHYSICIAN_REVIEW", reasons };
  }

  // Guideline not satisfied
  if (input.guidelinePassed === false) {
    reasons.push("Guideline adherence check failed");
    return { supervisorDecision: "NEEDS_PHYSICIAN_REVIEW", reasons };
  }

  // Complaint not complete enough for confident discharge
  if (input.completenessPassed === false) {
    reasons.push("Complaint completeness gate not met");
    return { supervisorDecision: "NEEDS_PHYSICIAN_REVIEW", reasons };
  }

  // Explicit external flag
  if (input.physicianRequired) {
    reasons.push("Explicit physician review flag set");
    return { supervisorDecision: "NEEDS_PHYSICIAN_REVIEW", reasons };
  }

  reasons.push("All governance checks passed");
  return { supervisorDecision: "APPROVE", reasons };
}
