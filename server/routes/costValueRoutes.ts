import express from "express";
import { computeCostValueDashboard } from "../analytics/costValueDashboard";

const router = express.Router();

router.get("/api/skill-layer/cost-value", async (_req, res) => {
  try {
    const rows = await computeCostValueDashboard();
    res.json({ ok: true, rows });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message ?? "unknown_error" });
  }
});

export default router;
