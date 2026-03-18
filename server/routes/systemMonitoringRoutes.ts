import { Router, Request, Response } from "express";
import { requireRole } from "../middleware/requireRole";
import { getMetrics, resetMetrics } from "../monitoring/metricsStore";
import { getAuditLog } from "../middleware/auditMiddleware";
import { runHighScaleSimulations } from "../engines/highScaleSimulationEngine";

const router = Router();
const auth = requireRole(["admin"]);

router.get("/metrics", auth, (_req: Request, res: Response) => {
  res.json(getMetrics());
});

router.post("/metrics/reset", auth, (_req: Request, res: Response) => {
  resetMetrics();
  res.json({ ok: true });
});

router.get("/audit-log", auth, (req: Request, res: Response) => {
  const limit = Number(req.query.limit || 100);
  res.json(getAuditLog(limit));
});

router.post("/simulate-high-scale", auth, (req: Request, res: Response) => {
  try {
    const perPack = req.body.perPack || 1000;
    const packs = req.body.packs || [
      { id: "demo_cough" },
      { id: "demo_dizziness" },
      { id: "demo_chest_pain" },
    ];
    const results = runHighScaleSimulations(packs, perPack);
    res.json({ ok: true, results });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
