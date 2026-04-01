import { Router } from "express";
import { computeOutcomeWeightedRevenue } from "./revenueEngine";

const router = Router();

router.get("/revenue", (_req, res) => {
  try {
    const data = computeOutcomeWeightedRevenue();
    res.json({ ok: true, ...data });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/kpis", (_req, res) => {
  try {
    const data = computeOutcomeWeightedRevenue();
    res.json({ ok: true, kpis: data.kpis, grade: data.grade, gradeColor: data.gradeColor });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
