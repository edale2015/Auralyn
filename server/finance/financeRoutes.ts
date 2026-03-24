import { Router } from "express";
import {
  recordPatient, getFinancialSnapshot, computeLTV, computeCAC, computeMargin,
  getRevenueBySource, getRevenueByComplaint,
} from "./metricsEngine";

const router = Router();

router.get("/dashboard", (_req, res) => {
  const snapshot = getFinancialSnapshot();
  res.json({ ok: true, dashboard: snapshot });
});

router.get("/ltv", (_req, res) => {
  res.json({ ok: true, ltv: computeLTV(), unit: "USD per patient" });
});

router.get("/cac", (_req, res) => {
  res.json({ ok: true, cac: computeCAC(), unit: "USD per patient acquired" });
});

router.get("/margin", (_req, res) => {
  res.json({ ok: true, margin: computeMargin(), marginPct: `${(computeMargin() * 100).toFixed(1)}%` });
});

router.post("/patient", (req, res) => {
  const { id, acquisitionCost, revenue } = req.body;
  if (!id || acquisitionCost === undefined || revenue === undefined) {
    return res.status(400).json({ ok: false, error: "id, acquisitionCost, revenue required" });
  }
  recordPatient(req.body);
  res.json({ ok: true, snapshot: getFinancialSnapshot() });
});

router.get("/breakdown/source", (_req, res) => {
  res.json({ ok: true, bySource: getRevenueBySource() });
});

router.get("/breakdown/complaint", (_req, res) => {
  res.json({ ok: true, byComplaint: getRevenueByComplaint() });
});

export default router;
