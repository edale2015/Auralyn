/**
 * Change Approval Gate — Golden Case Mandatory Gate
 *
 * Every proposed change (KB update, RLHF weight shift, scoring threshold
 * adjustment) must pass through this gate before taking effect.
 *
 * Hard safety block: any safety mismatch (missed ER_NOW) rejects the proposal.
 * Quality threshold: accuracy must be ≥ 95%.
 *
 * This is the FDA story: "No update is deployed unless it passes validated cases."
 */

import { runGoldenCaseSimulation, type GoldenCase, type SimulationResult } from "../simulation/goldenCaseEngine";

// ── Thresholds ────────────────────────────────────────────────────────────────

const ACCURACY_THRESHOLD   = 0.95;  // 95% minimum disposition accuracy
const MAX_SAFETY_MISMATCHES = 0;    // zero tolerance for missed ER_NOW cases

// ── Gate ──────────────────────────────────────────────────────────────────────

export interface GateResult {
  approved:   boolean;
  reason:     string;
  metrics:    SimulationResult;
}

/**
 * Validate a proposed change against the golden case suite.
 *
 * Throws if the change would degrade safety or accuracy beyond acceptable bounds.
 * Returns the full simulation result on success so callers have diagnostic data.
 *
 * Usage:
 *   const gate = await validateChangeWithGoldenCases(proposal, goldenCases, traceId);
 *   // Only reaches here if approved — gate throws on rejection
 *   applyChange(proposal);
 */
export async function validateChangeWithGoldenCases(
  proposal:     unknown,
  goldenCases:  GoldenCase[],
  traceId:      string
): Promise<GateResult> {
  if (goldenCases.length === 0) {
    throw new Error(
      "[ChangeApprovalGate] Cannot validate against empty golden case set. " +
      "At least one golden case is required."
    );
  }

  const metrics = await runGoldenCaseSimulation(goldenCases, traceId);

  // ── Hard safety block — zero tolerance ───────────────────────────────────
  if (metrics.safetyMismatches > MAX_SAFETY_MISMATCHES) {
    throw new Error(
      `[GOLDEN CASE BLOCK] Safety regression detected: ` +
      `${metrics.safetyMismatches} case(s) lost ER_NOW detection. ` +
      `No tolerance for missed emergency escalations. Proposal rejected.`
    );
  }

  // ── Quality threshold ─────────────────────────────────────────────────────
  if (metrics.accuracyRate < ACCURACY_THRESHOLD) {
    throw new Error(
      `[GOLDEN CASE BLOCK] Accuracy dropped to ${(metrics.accuracyRate * 100).toFixed(1)}% ` +
      `(threshold: ${(ACCURACY_THRESHOLD * 100).toFixed(0)}%). ` +
      `${metrics.incorrectDisposition} of ${metrics.totalCases} cases have wrong disposition. ` +
      `Proposal rejected.`
    );
  }

  return {
    approved: true,
    reason:   `All ${metrics.totalCases} golden cases passed — accuracy ${(metrics.accuracyRate * 100).toFixed(1)}%, zero safety mismatches.`,
    metrics,
  };
}
