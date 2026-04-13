/**
 * server/governance/modelApproval.ts
 *
 * FIX (Batch-1 Finding #3 — Critical): applyApprovedUpdate() now actually applies
 * the model change via applyEngine.applyModelChange(). Previously it only called
 * updateGovernanceStatus() and emitted an event — the model was never changed.
 *
 * All functions are now async because governanceQueue functions are DB-backed.
 */

import { addGovernanceItem, updateGovernanceStatus, listGovernanceQueue } from "./governanceQueue";
import { applyModelChange }  from "./applyEngine";
import { emitEvent }         from "../controlTower/eventBus";
import { v4 as uuidv4 }      from "uuid";

export type ApprovalDecision = "AUTO_APPROVED" | "PENDING_REVIEW" | "BLOCKED";

export interface ModelChange {
  packId?:     string;
  metricName?: string;
  oldValue:    number;
  newValue:    number;
  impact:      number;
  source?:     string;
}

export interface ApprovalResult {
  approved:           boolean;
  decision:           ApprovalDecision;
  reason:             string;
  impactPercent:      number;
  requiresPhysician:  boolean;
  governanceItemId?:  string;
}

const AUTO_APPROVE_THRESHOLD = 0.05;
const BLOCK_THRESHOLD        = 0.25;

export function requireApproval(change: ModelChange): ApprovalResult {
  const impactPercent = Math.abs(change.impact);

  if (impactPercent >= BLOCK_THRESHOLD) {
    return {
      approved: false, decision: "BLOCKED",
      reason: `Change impact ${(impactPercent * 100).toFixed(1)}% exceeds safety ceiling ${(BLOCK_THRESHOLD * 100).toFixed(0)}%. Manual clinical review required.`,
      impactPercent, requiresPhysician: true,
    };
  }

  if (impactPercent > AUTO_APPROVE_THRESHOLD) {
    return {
      approved: false, decision: "PENDING_REVIEW",
      reason: `Change impact ${(impactPercent * 100).toFixed(1)}% exceeds auto-approve threshold ${(AUTO_APPROVE_THRESHOLD * 100).toFixed(0)}%. Requires physician approval.`,
      impactPercent, requiresPhysician: true,
    };
  }

  return {
    approved: true, decision: "AUTO_APPROVED",
    reason: `Change impact ${(impactPercent * 100).toFixed(1)}% within auto-approve threshold. Applied automatically.`,
    impactPercent, requiresPhysician: false,
  };
}

export async function proposeLearningUpdate(
  packId:       string,
  oldAccuracy:  number,
  newAccuracy:  number,
  source = "learning_cycle"
): Promise<ApprovalResult> {
  const impact  = newAccuracy - oldAccuracy;
  const change: ModelChange = { packId, metricName: "accuracy", oldValue: oldAccuracy, newValue: newAccuracy, impact, source };
  const result  = requireApproval(change);

  if (!result.approved) {
    const id   = uuidv4();
    const risk = result.decision === "BLOCKED" ? "high" : "medium";

    await addGovernanceItem({
      id,
      sheet:  `learning:${packId}`,
      change: { packId, oldAccuracy, newAccuracy, impactPercent: result.impactPercent, source },
      risk,
      reason: result.reason,
    });

    result.governanceItemId = id;

    emitEvent({
      type:    "ALERT",
      payload: { message: `Model update for "${packId}" queued for physician review (impact: ${(result.impactPercent * 100).toFixed(1)}%)`, severity: risk === "high" ? "HIGH" : "MEDIUM", governanceItemId: id, decision: result.decision },
      timestamp: Date.now(),
    });
  } else {
    emitEvent({
      type:    "ENGINE_STATUS",
      payload: { name: `learning:${packId}`, status: "auto-approved", impactPercent: result.impactPercent, newAccuracy },
      timestamp: Date.now(),
    });
  }

  return result;
}

/**
 * FIX (Finding #3): applyApprovedUpdate() now calls applyModelChange() to
 * actually update the model — previously it only set status and emitted an event.
 */
export async function applyApprovedUpdate(
  itemId:     string,
  reviewedBy = "system"
): Promise<boolean> {
  const queue = await listGovernanceQueue({ status: "pending" });
  const item  = queue.find((i) => i.id === itemId);

  if (!item) {
    console.warn(`[ModelApproval] Item ${itemId} not found in pending queue`);
    return false;
  }

  // FIX: Actually apply the model change before updating status
  await applyModelChange(itemId, item.change, reviewedBy);

  const updated = await updateGovernanceStatus(itemId, "approved", reviewedBy);

  if (updated) {
    emitEvent({
      type:    "ENGINE_STATUS",
      payload: { name: item.sheet, status: "approved-and-applied", reviewedBy, appliedAt: new Date().toISOString() },
      timestamp: Date.now(),
    });
    console.log(`[ModelApproval] Update ${itemId} (${item.sheet}) approved AND applied by ${reviewedBy}`);
  }

  return updated;
}

export async function rejectUpdate(
  itemId:     string,
  reviewedBy = "system",
  reason?:    string
): Promise<boolean> {
  const updated = await updateGovernanceStatus(itemId, "rejected", reviewedBy);

  if (updated) {
    emitEvent({
      type:    "ALERT",
      payload: { message: `Model update ${itemId} rejected by ${reviewedBy}${reason ? `: ${reason}` : ""}`, severity: "MEDIUM" },
      timestamp: Date.now(),
    });
  }

  return updated;
}

export async function getPendingModelApprovals() {
  const queue = await listGovernanceQueue({ status: "pending" });
  return queue.filter((i) => i.sheet.startsWith("learning:"));
}

export async function getModelApprovalStats() {
  const all = await listGovernanceQueue();
  const learning = all.filter((i) => i.sheet.startsWith("learning:"));
  return {
    total:    learning.length,
    pending:  learning.filter((i) => i.status === "pending").length,
    approved: learning.filter((i) => i.status === "approved").length,
    rejected: learning.filter((i) => i.status === "rejected").length,
    blocked:  learning.filter((i) => i.risk === "high" && i.status === "pending").length,
  };
}
