/**
 * RLHF physician approval gate.
 *
 * Before any weight update that exceeds the bounded threshold is
 * committed, it must pass through physician review.  This module
 * determines whether approval is required and formats the change
 * summary for the review queue.
 */

import { pendingApprovalItems, WeightMap } from "./rlhfEngine";

export interface ApprovalRequest {
  requiresApproval: boolean;
  changes:          Array<{ feature: string; diff: number; proposed: number; current: number }>;
  summary:          string;
}

/**
 * Inspect proposed vs current model and return an approval request
 * containing everything the physician needs to evaluate the change.
 */
export function requireApproval(
  proposedModel: WeightMap,
  currentModel:  WeightMap,
): ApprovalRequest {
  const items = pendingApprovalItems(proposedModel, currentModel);

  const changes = items.map((item) => ({
    feature:  item.feature,
    diff:     item.diff,
    proposed: proposedModel[item.feature] ?? 0,
    current:  currentModel[item.feature]  ?? 0,
  }));

  const summary =
    changes.length === 0
      ? "No physician approval required — all deltas within automatic threshold."
      : `${changes.length} feature weight(s) require physician approval: ` +
        changes.map((c) => `${c.feature} (${c.current.toFixed(4)} → ${c.proposed.toFixed(4)})`).join(", ");

  return { requiresApproval: changes.length > 0, changes, summary };
}

/**
 * Apply the proposed model only if no approval is required.
 * Returns null if approval is still needed.
 */
export function applyIfAutomatic(
  proposedModel: WeightMap,
  currentModel:  WeightMap,
): WeightMap | null {
  const approval = requireApproval(proposedModel, currentModel);
  if (approval.requiresApproval) return null;
  return proposedModel;
}
