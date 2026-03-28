import { Router, Request, Response } from "express";
import { runAllGoldenCases } from "../golden/goldenRunner";
import { computeMetrics } from "../fda/metricsEngine";
import { GOLDEN_CASES } from "../golden/goldenCases";
import { getBayesSnapshot } from "../core/engines/bayesianEngine";
import { getSimilarityCaseCount } from "../core/engines/similarityEngine";
import { getDispatchLog } from "../alerting/alertDispatcher";

const router = Router();

/* ─── FDA Validation Run ────────────────────────────────── */
router.post("/run", async (_req: Request, res: Response) => {
  try {
    const goldenResults = await runAllGoldenCases();
    const validationResults = goldenResults.map(r => ({
      input:     { caseId: r.caseId, complaint: r.rawOutput?.complaint ?? r.caseId },
      predicted: r.matchedKeywords[0] ?? null,
      actual:    GOLDEN_CASES.find(g => g.id === r.caseId)?.expectedKeywords[0] ?? "unknown",
      correct:   r.passed,
      safety:    r.blocked ? "BLOCKED" : "ALLOWED",
      confidence: r.passed ? 1 : 0,
    }));

    const metrics = computeMetrics(validationResults);

    const safetyCorrect   = goldenResults.filter(r => {
      const gc = GOLDEN_CASES.find(g => g.id === r.caseId);
      return gc && ((gc.mustBlock && r.blocked) || (!gc.mustBlock && !r.blocked));
    }).length;
    const safetyTotal = goldenResults.length;

    return res.json({
      ok: true,
      report: {
        ranAt:        new Date().toISOString(),
        metrics,
        safetyAccuracy: Number((safetyCorrect / safetyTotal).toFixed(4)),
        goldenResults,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message });
  }
});

/* ─── Latest cached golden status ──────────────────────── */
router.get("/status", (_req: Request, res: Response) => {
  res.json({ ok: true, totalGoldenCases: GOLDEN_CASES.length });
});

/* ─── Engine intelligence snapshot ─────────────────────── */
router.get("/intelligence", (_req: Request, res: Response) => {
  res.json({
    ok: true,
    bayesian:   getBayesSnapshot(),
    similarity: { storedCases: getSimilarityCaseCount() },
    alertLog:   getDispatchLog(20),
  });
});

export default router;
