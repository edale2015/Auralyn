/**
 * server/routes/deteriorationRoutes.ts
 * Real-time Bayesian deterioration API.
 *
 * POST /api/deterioration/assess    — score single patient vitals snapshot
 * POST /api/deterioration/network   — run full Bayesian causal network
 * POST /api/deterioration/trend     — score vital history (time-series)
 * GET  /api/deterioration/sim/start — start ICU simulator
 * GET  /api/deterioration/sim/stop  — stop ICU simulator
 * GET  /api/deterioration/sim/status
 */

import express from "express";
import { requirePhysician } from "../auth/requirePhysician";
import { computeDeteriorationRisk }  from "../prediction/deteriorationEngine";
import { computeTrendRisk }          from "../prediction/timeSeriesEngine";
import { runClinicalNetworks }       from "../ai/bayesianNetwork";
import { startICUSimulator, stopICUSimulator, isRunning } from "../simulation/icuSimulator";

const router = express.Router();
router.use(requirePhysician);

// ── POST /api/deterioration/assess ───────────────────────────────────────────

router.post("/assess", (req, res) => {
  try {
    const { vitals } = req.body;
    if (!vitals || typeof vitals !== "object") {
      return res.status(400).json({ ok: false, error: "vitals object required" });
    }
    const risk = computeDeteriorationRisk(vitals);
    res.json({ ok: true, risk });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message });
  }
});

// ── POST /api/deterioration/network ──────────────────────────────────────────

router.post("/network", (req, res) => {
  try {
    const { vitals = {}, symptoms = {} } = req.body ?? {};
    const networks = runClinicalNetworks(vitals, symptoms);
    res.json({ ok: true, networks });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message });
  }
});

// ── POST /api/deterioration/trend ─────────────────────────────────────────────

router.post("/trend", (req, res) => {
  try {
    const { history } = req.body;
    if (!history) {
      return res.status(400).json({ ok: false, error: "history object required" });
    }
    const trend = computeTrendRisk(history);
    res.json({ ok: true, trend });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message });
  }
});

// ── ICU Simulator ─────────────────────────────────────────────────────────────

router.post("/sim/start", (_req, res) => {
  startICUSimulator();
  res.json({ ok: true, running: true });
});

router.post("/sim/stop", (_req, res) => {
  stopICUSimulator();
  res.json({ ok: true, running: false });
});

router.get("/sim/status", (_req, res) => {
  res.json({ ok: true, running: isRunning() });
});

export default router;
