import { Router } from "express";
import { reviewQueueService } from "../services/reviewQueueService";
import { requireRole } from "../middleware/requireRole";

export const reviewQueueRouter = Router();

reviewQueueRouter.get("/", requireRole(["admin", "physician", "staff"]), async (req, res) => {
  try {
    const limit = Number(req.query.limit ?? 50);
    const cases = await reviewQueueService.listQueue(limit);
    res.json({
      count: cases.length,
      cases
    });
  } catch (e: any) {
    console.error("[ReviewQueue] list error:", e);
    res.status(500).json({ error: e.message });
  }
});

reviewQueueRouter.post("/:caseId/assign", requireRole(["admin", "physician"]), async (req, res) => {
  try {
    const { caseId } = req.params;
    const { reviewerId } = req.body;
    if (!reviewerId) return res.status(400).json({ error: "missing reviewerId" });
    await reviewQueueService.assignReviewer(caseId, reviewerId);
    res.json({ ok: true });
  } catch (e: any) {
    console.error("[ReviewQueue] assign error:", e);
    res.status(500).json({ error: e.message });
  }
});

reviewQueueRouter.post("/:caseId/request-info", requireRole(["admin", "physician"]), async (req, res) => {
  try {
    const { caseId } = req.params;
    const { reviewerId, questions } = req.body;
    if (!reviewerId || typeof reviewerId !== "string") return res.status(400).json({ error: "missing or invalid reviewerId" });
    if (!Array.isArray(questions) || questions.length === 0 || !questions.every((q: any) => typeof q === "string")) {
      return res.status(400).json({ error: "questions must be a non-empty array of strings" });
    }
    await reviewQueueService.requestMoreInfo(caseId, reviewerId, questions);
    res.json({ ok: true });
  } catch (e: any) {
    console.error("[ReviewQueue] request-info error:", e);
    res.status(500).json({ error: e.message });
  }
});
