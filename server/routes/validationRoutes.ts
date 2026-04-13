/**
 * Clinical Validation API Routes
 * FDA SaMD performance metrics, synthetic trial runs, SaMD dossier generation,
 * audit replay, and drift detection.
 */

import { Router } from "express";
import { requireRole } from "../middleware/requireRole";
import { computeMetrics, generatePerformanceSummary } from "../validation/clinicalValidationEngine";
import { generateCases } from "../validation/generateSyntheticCases";
import { runTrialBatch } from "../validation/trialSimulator";
import { generateDossier } from "../validation/samdDossierGenerator";
import { detectDrift } from "../validation/driftDetector";
import { replayCase } from "../validation/auditReplay";

const router = Router();

/** GET /api/validation/run?n=1000 — run synthetic trial and return metrics */
router.get("/run", async (req, res) => {
  try {
    const n = Math.min(5000, Math.max(10, Number(req.query.n ?? 1000)));
    const cases = generateCases(n);
    const { results, durationMs } = await runTrialBatch(cases, 200);
    const metrics = computeMetrics(results);
    const summary = generatePerformanceSummary(metrics);
    res.json({ metrics, summary, durationMs, n });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/validation/dossier — generate FDA SaMD dossier from latest trial */
router.get("/dossier", async (_req, res) => {
  try {
    const cases = generateCases(1000);
    const { results } = await runTrialBatch(cases, 200);
    const metrics = computeMetrics(results);
    const dossier = generateDossier({ metrics, modelVersion: "v2.0.0" });
    res.json(dossier);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/validation/drift — detect drift between baseline and current metrics */
router.post("/drift", requireRole("physician"), (req, res) => {
  const { baseline, current, metricName, threshold } = req.body;
  if (!Array.isArray(baseline) || !Array.isArray(current)) {
    return res.status(400).json({ error: "baseline and current must be number arrays" });
  }
  const report = detectDrift(baseline, current, metricName ?? "sensitivity", threshold ?? 0.05);
  res.json(report);
});

/** POST /api/validation/replay — replay an audit trace */
router.post("/replay", requireRole("physician"), (req, res) => {
  const { trace } = req.body;
  if (!Array.isArray(trace)) {
    return res.status(400).json({ error: "trace must be an array of audit steps" });
  }
  const report = replayCase(trace);
  res.json(report);
});

export default router;
