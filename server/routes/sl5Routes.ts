import { Router } from "express";
import {
  getComplaintTrends,
  getDispositionDistribution,
  getDriftAlerts,
  getPopulationSummary,
} from "../sl5/populationHealthService";

const router = Router();

router.get("/api/sl5/complaint-trends", async (_req, res) => {
  try {
    res.json({ trends: getComplaintTrends() });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/api/sl5/disposition-distribution", async (_req, res) => {
  try {
    res.json({ distribution: getDispositionDistribution() });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/api/sl5/drift-alerts", async (_req, res) => {
  try {
    res.json({ alerts: getDriftAlerts() });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/api/sl5/summary", async (_req, res) => {
  try {
    const summary = await getPopulationSummary();
    res.json(summary);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
