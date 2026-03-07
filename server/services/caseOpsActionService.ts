import { firestoreCaseStore } from "./firestoreCaseStore";
import { firestoreCaseEventsStore } from "./firestoreCaseEvents";

export type CaseOpsAction = "assign_reviewer" | "request_more_info" | "escalate" | "close";

export interface OpsActionResult {
  caseId: string;
  action: CaseOpsAction;
  success: boolean;
  message: string;
}

export async function executeCaseOpsAction(
  caseId: string,
  action: CaseOpsAction,
  params: {
    reviewerId?: string;
    reason?: string;
    actorId?: string;
  }
): Promise<OpsActionResult> {
  const caseRecord = await firestoreCaseStore.getCase(caseId);
  if (!caseRecord) {
    return { caseId, action, success: false, message: "Case not found" };
  }

  switch (action) {
    case "assign_reviewer": {
      if (!params.reviewerId) {
        return { caseId, action, success: false, message: "reviewerId required" };
      }
      await firestoreCaseStore.assignReviewer(caseId, params.reviewerId);
      await firestoreCaseEventsStore.appendEvent({
        caseId,
        type: "ASSIGNED_REVIEWER",
        actorRole: "staff",
        actorId: params.actorId,
        summary: `Reviewer ${params.reviewerId} assigned`,
        payload: { reviewerId: params.reviewerId },
      });
      return { caseId, action, success: true, message: `Reviewer ${params.reviewerId} assigned` };
    }

    case "request_more_info": {
      await firestoreCaseStore.markNeedsMoreInfo(caseId, []);
      await firestoreCaseEventsStore.appendEvent({
        caseId,
        type: "REVIEW_REQUESTED_MORE_INFO",
        actorRole: "physician",
        actorId: params.actorId,
        summary: params.reason || "Additional information requested",
        payload: { reason: params.reason || "" },
      });
      return { caseId, action, success: true, message: "More info requested" };
    }

    case "escalate": {
      await firestoreCaseStore.patchCase(caseId, {
        status: "ESCALATED" as any,
        reviewStatus: "ESCALATED" as any,
      });
      await firestoreCaseEventsStore.appendEvent({
        caseId,
        type: "CUSTOM",
        actorRole: "physician",
        actorId: params.actorId,
        summary: `Case escalated: ${params.reason || "Urgent review needed"}`,
        payload: { reason: params.reason || "", customType: "CASE_ESCALATED" },
      });
      return { caseId, action, success: true, message: "Case escalated" };
    }

    case "close": {
      await firestoreCaseStore.closeCase(caseId);
      await firestoreCaseEventsStore.appendEvent({
        caseId,
        type: "CASE_CLOSED",
        actorRole: "staff",
        actorId: params.actorId,
        summary: params.reason || "Case closed",
        payload: { reason: params.reason || "" },
      });
      return { caseId, action, success: true, message: "Case closed" };
    }

    default:
      return { caseId, action, success: false, message: `Unknown action: ${action}` };
  }
}
