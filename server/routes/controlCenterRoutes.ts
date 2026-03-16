import { Router, Request, Response } from "express";
import { requireRole } from "../middleware/requireRole";
import { generateControlCenterSnapshot } from "../controlCenter/controlCenterService";
import { safetyScoreEngine } from "../safety/clinicalSafetyScoreEngine";
import { getEngineStats, getProfilerSummary } from "../performance/engineProfiler";

const router = Router();

router.get("/api/control-center/snapshot", requireRole(["admin", "physician"]), (req: Request, res: Response) => {
  try {
    const snapshot = generateControlCenterSnapshot();
    res.json(snapshot);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to generate snapshot" });
  }
});

router.post("/api/control-center/safety-score", requireRole(["admin"]), (req: Request, res: Response) => {
  const metrics = req.body;
  const result = safetyScoreEngine.calculate(metrics);
  res.json(result);
});

router.get("/api/control-center/engine-stats", requireRole(["admin", "physician"]), (_req: Request, res: Response) => {
  res.json({
    engines: getEngineStats(),
    summary: getProfilerSummary(),
  });
});

export default router;
