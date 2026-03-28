import { Router, Request, Response } from "express";
import { runSelfLearning, getLearningSnapshot, getLastCycles } from "../learning/selfLearningEngine";
import { runGoldenMonitor, getLastGoldenSummary } from "../golden/goldenMonitor";
import { getSafetyBlockLog, getSafetySummary } from "../safety/safetyGuard";

const router = Router();

/* ─── Self-Learning ─────────────────────────────────────── */
router.get("/learning/snapshot", (_req: Request, res: Response) => {
  res.json({ ok: true, snapshot: getLearningSnapshot() });
});

router.get("/learning/cycles", (_req: Request, res: Response) => {
  res.json({ ok: true, cycles: getLastCycles(20) });
});

router.post("/learning/run", (_req: Request, res: Response) => {
  const cycle = runSelfLearning();
  res.json({ ok: true, cycle });
});

/* ─── Golden Cases ──────────────────────────────────────── */
router.get("/golden/status", (_req: Request, res: Response) => {
  res.json({ ok: true, summary: getLastGoldenSummary() });
});

router.post("/golden/run", async (_req: Request, res: Response) => {
  try {
    const summary = await runGoldenMonitor();
    res.json({ ok: true, summary });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message });
  }
});

/* ─── Safety Guard ──────────────────────────────────────── */
router.get("/safety/summary", (_req: Request, res: Response) => {
  res.json({ ok: true, summary: getSafetySummary() });
});

router.get("/safety/blocks", (_req: Request, res: Response) => {
  res.json({ ok: true, blocks: getSafetyBlockLog().slice(0, 50) });
});

export default router;
