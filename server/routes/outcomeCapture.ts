import { Router } from "express";
import { requireRole } from "../middleware/requireRole";
import { captureOutcome, getOutcome } from "../services/outcomes/outcomeCaptureService";

export const outcomeCaptureRouter = Router();

outcomeCaptureRouter.get("/:caseId", requireRole(["admin", "physician"]), async (req, res) => {
  try {
    const outcome = await getOutcome(req.params.caseId);
    res.json(outcome || { caseId: req.params.caseId, message: "No outcome recorded" });
  } catch (err: any) { res.status(500).json({ error: err?.message ?? "Failed to get outcome" }); }
});

outcomeCaptureRouter.post("/", requireRole(["admin", "physician"]), async (req, res) => {
  try {
    const result = await captureOutcome({
      ...req.body,
      capturedAt: new Date().toISOString(),
      capturedBy: (req as any).authUser?.userId,
    });
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err?.message ?? "Failed to capture outcome" }); }
});
