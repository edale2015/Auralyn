import { intakeCaseStore, StructuredIntakeCase } from "../services/intakeCaseStore";
import { intakeAuditLog } from "../services/intakeAuditLog";

export interface BatchApprovalRequest {
  caseIds: string[];
  physicianId: string;
  action: "approve" | "escalate" | "request_review";
  overrideDisposition?: string;
  overridePlanNote?: string;
}

export function executeBatchApproval(req: BatchApprovalRequest): StructuredIntakeCase[] {
  const results: StructuredIntakeCase[] = [];

  for (const caseId of req.caseIds) {
    const current = intakeCaseStore.getCase(caseId);
    if (!current) continue;

    let queueStatus = current.queueStatus;
    let proposedDisposition = current.proposedDisposition;
    let overrideNotes = current.overrideNotes;

    if (req.action === "approve") {
      queueStatus = "approved";
    } else if (req.action === "escalate") {
      queueStatus = "escalated";
      proposedDisposition = (req.overrideDisposition as any) || "telemed_now";
      overrideNotes = req.overridePlanNote || "Escalated during batch review";
    } else if (req.action === "request_review") {
      queueStatus = "needs_review";
      overrideNotes = req.overridePlanNote || "Additional review requested";
    }

    const updated = intakeCaseStore.updateCase(caseId, {
      queueStatus,
      proposedDisposition,
      overrideNotes,
      approvedBy: req.physicianId,
      approvedAt: new Date().toISOString(),
    });

    intakeAuditLog.write({
      actor: req.physicianId,
      entityId: caseId,
      event: `batch_${req.action}`,
      details: {
        priorStatus: current.queueStatus,
        nextStatus: queueStatus,
        overrideDisposition: req.overrideDisposition || null,
        overridePlanNote: req.overridePlanNote || null,
      },
    });

    if (updated) results.push(updated);
  }

  return results;
}
