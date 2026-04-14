import { Router } from "express";
import { requireKbAdmin } from "../middleware/kbAuthMiddleware";
import {
  submitForReview,
  listPendingReviews,
  approveChange,
  rejectChange,
  getKbAuditTrail,
} from "../services/kbGovernanceService";

const router = Router();

// GET /api/kb-governance/queue — list all pending review items
router.get("/queue", requireKbAdmin, async (_req, res) => {
  try {
    const items = await listPendingReviews();
    res.json({ ok: true, items });
  } catch (err: any) {
    res.status(503).json({ ok: false, message: err?.message ?? "Failed to load review queue" });
  }
});

// POST /api/kb-governance/submit — submit a draft KB entity for review
router.post("/submit", requireKbAdmin, async (req, res) => {
  try {
    const { entityType, entityKey, version, actorId, rationale } = req.body;
    if (!entityType || !entityKey || !version || !actorId) {
      res.status(400).json({ ok: false, message: "entityType, entityKey, version, actorId required" });
      return;
    }
    await submitForReview({ entityType, entityKey, version, actorId, rationale });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err?.message ?? "Submit failed" });
  }
});

// POST /api/kb-governance/approve/:id — approve a pending KB change
router.post("/approve/:id", requireKbAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const reviewerId =
      (req as any).physician?.id ||
      (req as any).user?.id ||
      req.body?.reviewerId;

    if (!reviewerId) {
      res.status(400).json({ ok: false, message: "reviewerId required" });
      return;
    }

    await approveChange(id, reviewerId);
    res.json({ ok: true });
  } catch (err: any) {
    const status = err?.message?.includes("not found") ? 404
                 : err?.message?.includes("already")  ? 409
                 : 500;
    res.status(status).json({ ok: false, message: err?.message ?? "Approve failed" });
  }
});

// POST /api/kb-governance/reject/:id — reject a pending KB change
router.post("/reject/:id", requireKbAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const reviewerId =
      (req as any).physician?.id ||
      (req as any).user?.id ||
      req.body?.reviewerId;
    const { reason } = req.body;

    if (!reviewerId || !reason) {
      res.status(400).json({ ok: false, message: "reviewerId and reason required" });
      return;
    }

    await rejectChange(id, reviewerId, reason);
    res.json({ ok: true });
  } catch (err: any) {
    const status = err?.message?.includes("not found") ? 404
                 : err?.message?.includes("already")  ? 409
                 : 500;
    res.status(status).json({ ok: false, message: err?.message ?? "Reject failed" });
  }
});

// GET /api/kb-governance/audit — KB audit trail
router.get("/audit", requireKbAdmin, async (req, res) => {
  try {
    const { entityKey } = req.query;
    const entries = await getKbAuditTrail(entityKey as string | undefined);
    res.json({ ok: true, entries });
  } catch (err: any) {
    res.status(503).json({ ok: false, message: err?.message ?? "Audit trail unavailable" });
  }
});

export default router;
