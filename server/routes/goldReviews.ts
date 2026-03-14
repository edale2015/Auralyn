import { Router } from "express";
import { requireRole } from "../middleware/requireRole";
import { goldReviewStore, type CreateGoldReviewInput } from "../services/goldReviewStore";

export const goldReviewsRouter = Router();

goldReviewsRouter.post("/", requireRole(["admin", "physician"]), async (req, res) => {
  try {
    const body = req.body as CreateGoldReviewInput;
    if (!body.complaintId || !body.disposition || !body.createdBy) {
      res.status(400).json({ error: "complaintId, disposition, and createdBy are required" });
      return;
    }
    const review = await goldReviewStore.create({
      complaintId: body.complaintId,
      caseId: body.caseId,
      disposition: body.disposition,
      topDiagnosis: body.topDiagnosis || "",
      mustAskNext: body.mustAskNext || [],
      optionalAskNext: body.optionalAskNext || [],
      enoughInfoNow: body.enoughInfoNow ?? false,
      tests: body.tests || [],
      medsConsidered: body.medsConsidered || [],
      medsAvoid: body.medsAvoid || [],
      redFlags: body.redFlags || [],
      confidence: body.confidence || "",
      rationale: body.rationale || "",
      createdBy: body.createdBy,
    });
    res.status(201).json(review);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to create gold review" });
  }
});

goldReviewsRouter.get("/export", requireRole(["admin", "physician"]), async (req, res) => {
  try {
    const format = (req.query.format as string) || "json";
    const complaintId = req.query.complaintId as string | undefined;
    const reviews = await goldReviewStore.list(complaintId);

    if (format === "csv") {
      const headers = [
        "reviewId", "complaintId", "caseId", "disposition", "topDiagnosis",
        "mustAskNext", "optionalAskNext", "enoughInfoNow", "tests",
        "medsConsidered", "medsAvoid", "redFlags", "confidence", "rationale",
        "createdBy", "createdAt",
      ];
      const escape = (v: unknown) => {
        const s = Array.isArray(v) ? v.join("; ") : String(v ?? "");
        return `"${s.replace(/"/g, '""')}"`;
      };
      const rows = reviews.map((r: any) =>
        headers.map((h) => escape(r[h])).join(",")
      );
      const csv = [headers.join(","), ...rows].join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="gold-reviews-${new Date().toISOString().slice(0, 10)}.csv"`);
      res.send(csv);
    } else {
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="gold-reviews-${new Date().toISOString().slice(0, 10)}.json"`);
      res.json({ exportedAt: new Date().toISOString(), count: reviews.length, reviews });
    }
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to export gold reviews" });
  }
});

goldReviewsRouter.get("/counts", requireRole(["admin", "physician"]), async (_req, res) => {
  try {
    const counts = await goldReviewStore.countByComplaint();
    res.json({ counts });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to get counts" });
  }
});

goldReviewsRouter.get("/", requireRole(["admin", "physician"]), async (req, res) => {
  try {
    const complaintId = req.query.complaintId as string | undefined;
    const reviews = await goldReviewStore.list(complaintId);
    res.json({ count: reviews.length, reviews });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to list gold reviews" });
  }
});

goldReviewsRouter.get("/:id", requireRole(["admin", "physician"]), async (req, res) => {
  try {
    const review = await goldReviewStore.get(req.params.id);
    if (!review) {
      res.status(404).json({ error: "Gold review not found" });
      return;
    }
    res.json(review);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to get gold review" });
  }
});

goldReviewsRouter.delete("/:id", requireRole(["admin", "physician"]), async (req, res) => {
  try {
    await goldReviewStore.delete(req.params.id);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to delete gold review" });
  }
});
