import { Router } from "express";
import { requireReviewAuth } from "../middleware/reviewAuth";
import {
  getCase,
  listReviewQueue,
  setPhysicianReview,
} from "../services/caseService";

export const reviewRouter = Router();

reviewRouter.use("/api/review", requireReviewAuth);

reviewRouter.get("/api/review/queue", async (req, res) => {
  try {
    const state =
      (req.query.state as "NEEDS_REVIEW" | "TRIAGED") ?? "NEEDS_REVIEW";
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const cases = await listReviewQueue({ state, limit });
    res.json(cases);
  } catch (e: any) {
    console.error("[Review] queue error:", e);
    res.status(500).json({ error: e.message });
  }
});

reviewRouter.get("/api/review/case/:caseId", async (req, res) => {
  try {
    const doc = await getCase(req.params.caseId);
    if (!doc) return res.status(404).json({ error: "not found" });
    res.json(doc);
  } catch (e: any) {
    console.error("[Review] case error:", e);
    res.status(500).json({ error: e.message });
  }
});

reviewRouter.post("/api/review/case/:caseId", async (req, res) => {
  try {
    const { status, notes, finalDisposition, finalDx, reviewer } =
      req.body ?? {};
    if (!status) return res.status(400).json({ error: "missing status" });

    const nextState =
      status === "APPROVED" || status === "MODIFIED"
        ? "APPROVED"
        : "NEEDS_REVIEW";

    await setPhysicianReview(
      req.params.caseId,
      {
        status,
        notes: notes ?? "",
        finalDisposition: finalDisposition ?? null,
        finalDx: finalDx ?? null,
        reviewer: reviewer ?? { id: "phys1", name: "Physician" },
      },
      nextState
    );

    res.json({ ok: true, nextState });
  } catch (e: any) {
    console.error("[Review] review error:", e);
    res.status(500).json({ error: e.message });
  }
});
