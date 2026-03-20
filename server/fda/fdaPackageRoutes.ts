import { Router } from "express";
import { runValidation } from "./validationRunner";
import { computeMetrics } from "./metricsEngine";
import { generateFDAReport } from "./reportGenerator";
import { exportFDABundle } from "./exportBundle";

const router = Router();

const BUILT_IN_DATASET = [
  { input: { complaint: "cough", answers: { age: 70, cough: true } }, actual: "viral_bronchitis" },
  { input: { complaint: "chest-pain", answers: { age: 65, chestPain: true } }, actual: "acs" },
  { input: { complaint: "sore-throat", answers: { age: 32, sorethroat: true } }, actual: "viral-pharyngitis" },
  { input: { complaint: "fever", answers: { age: 25, fever: true } }, actual: "viral-uri" },
  { input: { complaint: "ear-pain", answers: { age: 8, earPain: true } }, actual: "otitis-media" },
  { input: { complaint: "sinus", answers: { age: 40, congestion: true } }, actual: "sinusitis" },
  { input: { complaint: "cough", answers: { age: 55, cough: true, smoker: true } }, actual: "copd-exacerbation" },
  { input: { complaint: "sore-throat", answers: { age: 18, fever: true, exudate: true } }, actual: "strep-pharyngitis" },
];

router.post("/validate", async (req, res) => {
  try {
    const dataset = req.body?.dataset ?? BUILT_IN_DATASET;
    const threshold = req.body?.threshold ?? 0.8;

    const results = await runValidation(dataset);
    const metrics = computeMetrics(results, threshold);

    res.json({ ok: true, metrics, results });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message });
  }
});

router.post("/report", async (req, res) => {
  try {
    const dataset = req.body?.dataset ?? BUILT_IN_DATASET;
    const threshold = req.body?.threshold ?? 0.8;

    const results = await runValidation(dataset);
    const metrics = computeMetrics(results, threshold);
    const report = generateFDAReport(metrics, results);

    res.json({ ok: true, report });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message });
  }
});

router.post("/export", async (req, res) => {
  try {
    const dataset = req.body?.dataset ?? BUILT_IN_DATASET;
    const threshold = req.body?.threshold ?? 0.8;

    const results = await runValidation(dataset);
    const metrics = computeMetrics(results, threshold);
    const report = generateFDAReport(metrics, results);
    const bundle = exportFDABundle(report);

    res.json({ ok: true, bundle });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message });
  }
});

router.get("/status", (_req, res) => {
  res.json({
    ok: true,
    engineRegistry: ["scoring", "diagnosis", "billing", "learning", "safety", "monitoring", "simulation"],
    version: "1.0.0",
    complianceStandards: ["FDA 21 CFR Part 11", "ISO 13485", "IEC 62304"],
    submissionReadiness: "validation-required",
  });
});

export default router;
