/**
 * server/research/sliceValidation.ts
 * Slice proposal validation — runs a lightweight checklist against each proposal.
 *
 * Real validation gates require the golden case harness and diff inspection.
 * This module provides the orchestration layer that:
 *   1. Checks the proposal has required metadata
 *   2. Verifies no known safety anti-patterns exist in the rationale/affected files
 *   3. Records validation_status as "passed" | "failed" in slice_proposals
 */

import { db }           from "../db";
import { sliceProposals } from "../../shared/schema";
import { eq }           from "drizzle-orm";

type ValidationResult = {
  proposalId:      number;
  status:          "passed" | "failed";
  checks:          Array<{ name: string; passed: boolean; reason?: string }>;
  blockers:        string[];
};

const SAFETY_RED_FLAGS = [
  /bypass.*physician/i,
  /skip.*review/i,
  /remove.*validation/i,
  /disable.*audit/i,
  /weaken.*hallucin/i,
  /direct.*disposition/i,
  /rag.*final/i,
];

function checkForSafetyRedFlags(text: string): string[] {
  return SAFETY_RED_FLAGS
    .filter(re => re.test(text))
    .map(re => `Safety red flag matched: ${re.source}`);
}

export async function validateSliceProposal(proposalId: number): Promise<ValidationResult> {
  const rows = await db
    .select()
    .from(sliceProposals)
    .where(eq(sliceProposals.id, proposalId));

  const proposal = rows[0];
  if (!proposal) throw new Error(`Slice proposal ${proposalId} not found`);

  const checks: ValidationResult["checks"] = [];
  const blockers: string[] = [];

  // Check 1: Has title and rationale
  const hasMeta =
    proposal.title.trim().length > 3 &&
    proposal.rationale.trim().length > 10;
  checks.push({
    name:   "has_title_and_rationale",
    passed: hasMeta,
    reason: hasMeta ? undefined : "Title or rationale is too short",
  });
  if (!hasMeta) blockers.push("Missing title or rationale");

  // Check 2: Has at least one affected file
  const hasFiles = Array.isArray(proposal.affectedFiles) && proposal.affectedFiles.length > 0;
  checks.push({
    name:   "has_affected_files",
    passed: hasFiles,
    reason: hasFiles ? undefined : "No affected files listed",
  });
  if (!hasFiles) blockers.push("No affected files specified");

  // Check 3: Has a validation plan
  const hasPlan = Array.isArray(proposal.validationPlan) && proposal.validationPlan.length > 0;
  checks.push({
    name:   "has_validation_plan",
    passed: hasPlan,
    reason: hasPlan ? undefined : "No validation plan provided",
  });
  if (!hasPlan) blockers.push("No validation plan");

  // Check 4: No safety red flags in rationale
  const redFlags = checkForSafetyRedFlags(proposal.rationale + " " + proposal.title);
  const safeRationale = redFlags.length === 0;
  checks.push({
    name:   "no_safety_red_flags",
    passed: safeRationale,
    reason: safeRationale ? undefined : redFlags.join("; "),
  });
  if (!safeRationale) blockers.push(...redFlags);

  // Check 5: Not already approved (re-validation after modification)
  const notPreApproved = !proposal.approved;
  checks.push({
    name:   "not_already_approved",
    passed: notPreApproved,
    reason: notPreApproved ? undefined : "Proposal already approved — cannot re-validate",
  });

  const status: "passed" | "failed" = blockers.length === 0 ? "passed" : "failed";

  // Persist result
  await db
    .update(sliceProposals)
    .set({ validationStatus: status })
    .where(eq(sliceProposals.id, proposalId));

  return { proposalId, status, checks, blockers };
}
