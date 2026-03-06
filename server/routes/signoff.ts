import { Router } from "express";
import { signoffService } from "../services/signoffService";
import { requireRole } from "../middleware/requireRole";

export const signoffRouter = Router();

const VALID_STATUSES = ["APPROVED", "APPROVED_WITH_EDITS", "REQUEST_MORE_INFO", "ESCALATED", "REJECTED"] as const;

signoffRouter.post("/", requireRole(["admin", "physician"]), async (req, res) => {
  try {
    const { caseId, reviewerId, status, finalDisposition } = req.body ?? {};

    if (!caseId || typeof caseId !== "string") {
      return res.status(400).json({ error: "missing or invalid caseId" });
    }
    if (!reviewerId || typeof reviewerId !== "string") {
      return res.status(400).json({ error: "missing or invalid reviewerId" });
    }
    if (!status || !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `invalid status, must be one of: ${VALID_STATUSES.join(", ")}` });
    }

    const signoff = await signoffService.signoff(req.body);
    res.json(signoff);
  } catch (e: any) {
    console.error("[Signoff] error:", e);
    const code = e.message?.includes("not found") ? 404 : 500;
    res.status(code).json({ error: e.message });
  }
});
