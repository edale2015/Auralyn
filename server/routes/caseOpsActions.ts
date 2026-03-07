import { Router } from "express";
import { requireRole } from "../middleware/requireRole";
import { executeCaseOpsAction, type CaseOpsAction } from "../services/caseOpsActionService";

export const caseOpsActionsRouter = Router();

const VALID_ACTIONS: CaseOpsAction[] = ["assign_reviewer", "request_more_info", "escalate", "close"];

caseOpsActionsRouter.post(
  "/:caseId/:action",
  requireRole(["admin", "physician", "staff"]),
  async (req, res) => {
    try {
      const { caseId, action } = req.params;
      if (!VALID_ACTIONS.includes(action as CaseOpsAction)) {
        res.status(400).json({ error: `Invalid action: ${action}. Valid: ${VALID_ACTIONS.join(", ")}` });
        return;
      }
      const result = await executeCaseOpsAction(caseId, action as CaseOpsAction, {
        reviewerId: req.body?.reviewerId,
        reason: req.body?.reason,
        actorId: (req as any).authUser?.userId,
      });
      if (!result.success) {
        res.status(400).json(result);
        return;
      }
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Failed to execute action" });
    }
  }
);
