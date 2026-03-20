import { addGovernanceItem, updateGovernanceStatus, listGovernanceQueue } from "./governanceQueue";
import { emitEvent } from "../controlTower/eventBus";
import { v4 as uuidv4 } from "uuid";

export type ApprovalDecision = "AUTO_APPROVED" | "PENDING_REVIEW" | "BLOCKED";

export interface ModelChange {
  packId?: string;
  metricName?: string;
  oldValue: number;
  newValue: number;
  impact: number;
  source?: string;
}

export interface ApprovalResult {
  approved: boolean;
  decision: ApprovalDecision;
  reason: string;
  impactPercent: number;
  requiresPhysician: boolean;
  governanceItemId?: string;
}

const AUTO_APPROVE_THRESHOLD = 0.05;
const BLOCK_THRESHOLD = 0.25;

export function requireApproval(change: ModelChange): ApprovalResult {
  const impactPercent = Math.abs(change.impact);

  if (impactPercent >= BLOCK_THRESHOLD) {
    return {
      approved: false,
      decision: "BLOCKED",
      reason: `Change impact ${(impactPercent * 100).toFixed(1)}% exceeds safety ceiling ${(BLOCK_THRESHOLD * 100).toFixed(0)}%. Manual clinical review required.`,
      impactPercent,
      requiresPhysician: true,
    };
  }

  if (impactPercent > AUTO_APPROVE_THRESHOLD) {
    return {
      approved: false,
      decision: "PENDING_REVIEW",
      reason: `Change impact ${(impactPercent * 100).toFixed(1)}% exceeds auto-approve threshold ${(AUTO_APPROVE_THRESHOLD * 100).toFixed(0)}%. Requires physician approval.`,
      impactPercent,
      requiresPhysician: true,
    };
  }

  return {
    approved: true,
    decision: "AUTO_APPROVED",
    reason: `Change impact ${(impactPercent * 100).toFixed(1)}% within auto-approve threshold. Applied automatically.`,
    impactPercent,
    requiresPhysician: false,
  };
}

export function proposeLearningUpdate(
  packId: string,
  oldAccuracy: number,
  newAccuracy: number,
  source = "learning_cycle"
): ApprovalResult {
  const impact = newAccuracy - oldAccuracy;

  const change: ModelChange = {
    packId,
    metricName: "accuracy",
    oldValue: oldAccuracy,
    newValue: newAccuracy,
    impact,
    source,
  };

  const result = requireApproval(change);

  if (!result.approved) {
    const id = uuidv4();
    const risk = result.decision === "BLOCKED" ? "high" : "medium";

    addGovernanceItem({
      id,
      sheet: `learning:${packId}`,
      change: {
        packId,
        oldAccuracy,
        newAccuracy,
        impactPercent: result.impactPercent,
        source,
      },
      risk,
      reason: result.reason,
    });

    result.governanceItemId = id;

    emitEvent({
      type: "ALERT",
      payload: {
        message: `Model update for "${packId}" queued for physician review (impact: ${(result.impactPercent * 100).toFixed(1)}%)`,
        severity: risk === "high" ? "HIGH" : "MEDIUM",
        governanceItemId: id,
        decision: result.decision,
      },
      timestamp: Date.now(),
    });
  } else {
    emitEvent({
      type: "ENGINE_STATUS",
      payload: {
        name: `learning:${packId}`,
        status: "auto-approved",
        impactPercent: result.impactPercent,
        newAccuracy,
      },
      timestamp: Date.now(),
    });
  }

  return result;
}

export function applyApprovedUpdate(itemId: string, reviewedBy = "system"): boolean {
  const queue = listGovernanceQueue({ status: "pending" });
  const item = queue.find((i) => i.id === itemId);

  if (!item) {
    console.warn(`[ModelApproval] Item ${itemId} not found in pending queue`);
    return false;
  }

  const updated = updateGovernanceStatus(itemId, "approved", reviewedBy);

  if (updated) {
    emitEvent({
      type: "ENGINE_STATUS",
      payload: {
        name: item.sheet,
        status: "approved-and-applied",
        reviewedBy,
        appliedAt: new Date().toISOString(),
      },
      timestamp: Date.now(),
    });
    console.log(`[ModelApproval] Update ${itemId} (${item.sheet}) approved and applied by ${reviewedBy}`);
  }

  return updated;
}

export function rejectUpdate(itemId: string, reviewedBy = "system", reason?: string): boolean {
  const updated = updateGovernanceStatus(itemId, "rejected", reviewedBy);

  if (updated) {
    emitEvent({
      type: "ALERT",
      payload: {
        message: `Model update ${itemId} rejected by ${reviewedBy}${reason ? `: ${reason}` : ""}`,
        severity: "MEDIUM",
      },
      timestamp: Date.now(),
    });
  }

  return updated;
}

export function getPendingModelApprovals() {
  return listGovernanceQueue({ status: "pending" }).filter((i) => i.sheet.startsWith("learning:"));
}

export function getModelApprovalStats() {
  const all = listGovernanceQueue().filter((i) => i.sheet.startsWith("learning:"));
  return {
    total: all.length,
    pending: all.filter((i) => i.status === "pending").length,
    approved: all.filter((i) => i.status === "approved").length,
    rejected: all.filter((i) => i.status === "rejected").length,
    blocked: all.filter((i) => i.risk === "high" && i.status === "pending").length,
  };
}
