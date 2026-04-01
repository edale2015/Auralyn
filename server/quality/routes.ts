import { Router } from "express";
import { computeHEDISMetrics } from "./hedisEngine";
import { generateQualityReport } from "./reportGenerator";

const router = Router();

router.get("/hedis", async (_req, res) => {
  try {
    const report = await computeHEDISMetrics();
    res.json({ ok: true, ...report });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/report", async (req, res) => {
  try {
    const type = (req.query.type as any) ?? "COMPREHENSIVE";
    const report = await generateQualityReport(type);
    res.json({ ok: true, ...report });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/report/hedis", async (_req, res) => {
  try {
    const report = await generateQualityReport("HEDIS");
    res.json({ ok: true, ...report });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/report/fda", async (_req, res) => {
  try {
    const report = await generateQualityReport("FDA");
    res.json({ ok: true, ...report });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/report/payer", async (_req, res) => {
  try {
    const report = await generateQualityReport("PAYER");
    res.json({ ok: true, ...report });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
