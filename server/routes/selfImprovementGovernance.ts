import { Router, Request, Response } from "express";
import { requireRole } from "../middleware/requireRole";
import {
  listPendingReviews,
  approveAndApplyAction,
  rejectImprovementAction,
  getReviewHistory,
  getImprovementLog,
} from "../agents/selfImprovementReviewService";

const router = Router();

// ── GET /api/self-improvement/reviews — list pending actions ─────────────────
router.get(
  "/reviews",
  requireRole(["physician", "admin"]),
  async (_req: Request, res: Response) => {
    try {
      const actions = await listPendingReviews();
      res.json({ actions });
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Failed to fetch pending reviews" });
    }
  }
);

// ── POST /api/self-improvement/reviews/:id/approve ───────────────────────────
router.post(
  "/reviews/:id/approve",
  requireRole(["physician", "admin"]),
  async (req: Request, res: Response) => {
    const actionId = parseInt(req.params.id, 10);
    if (isNaN(actionId)) return res.status(400).json({ error: "Invalid action id" });

    const reviewerId = req.authUser?.userId ?? "unknown";
    const { note } = req.body as { note?: string };

    try {
      const result = await approveAndApplyAction(actionId, reviewerId, note);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Approve failed" });
    }
  }
);

// ── POST /api/self-improvement/reviews/:id/reject ────────────────────────────
router.post(
  "/reviews/:id/reject",
  requireRole(["physician", "admin"]),
  async (req: Request, res: Response) => {
    const actionId = parseInt(req.params.id, 10);
    if (isNaN(actionId)) return res.status(400).json({ error: "Invalid action id" });

    const reviewerId = req.authUser?.userId ?? "unknown";
    const { note } = req.body as { note?: string };

    try {
      await rejectImprovementAction(actionId, reviewerId, note);
      res.json({ rejected: true });
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Reject failed" });
    }
  }
);

// ── GET /api/self-improvement/reviews/:id/history ────────────────────────────
router.get(
  "/reviews/:id/history",
  requireRole(["physician", "admin"]),
  async (req: Request, res: Response) => {
    const actionId = parseInt(req.params.id, 10);
    if (isNaN(actionId)) return res.status(400).json({ error: "Invalid action id" });

    try {
      const history = await getReviewHistory(actionId);
      res.json({ history });
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Failed to fetch history" });
    }
  }
);

// ── GET /api/self-improvement/log — recent improvement actions ───────────────
router.get(
  "/log",
  requireRole(["physician", "admin"]),
  async (req: Request, res: Response) => {
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    try {
      const actions = await getImprovementLog(limit);
      res.json({ actions });
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Failed to fetch log" });
    }
  }
);

export default router;
