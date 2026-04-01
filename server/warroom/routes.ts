import { Router } from "express";
import { getWarRoomSnapshot, updateRLHFWeights, getRLHFState } from "./warRoomEngine";

const router = Router();

router.get("/snapshot", async (_req, res) => {
  try {
    const snapshot = await getWarRoomSnapshot();
    res.json({ ok: true, ...snapshot });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/agents", async (_req, res) => {
  try {
    const snapshot = await getWarRoomSnapshot();
    res.json({ ok: true, agents: snapshot.agents, systemHealth: snapshot.systemHealth });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/alerts", async (_req, res) => {
  try {
    const snapshot = await getWarRoomSnapshot();
    res.json({ ok: true, alerts: snapshot.alerts, count: snapshot.alerts.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/rlhf", (_req, res) => {
  const state = getRLHFState();
  res.json({ ok: true, ...state });
});

router.post("/rlhf/trigger", (_req, res) => {
  try {
    const now = new Date();
    const delta = {
      diagnosisWeight: Math.max(0.5, Math.min(2.0, getRLHFState().diagnosisWeight + (Math.random() * 0.1 - 0.03))),
      escalationPenalty: Math.max(0.5, Math.min(2.0, getRLHFState().escalationPenalty + (Math.random() * 0.08 - 0.02))),
      outcomeWeight: Math.max(0.5, Math.min(2.0, getRLHFState().outcomeWeight + (Math.random() * 0.06 - 0.01))),
      totalAdjustments: getRLHFState().totalAdjustments + 1,
    };
    updateRLHFWeights(delta);
    res.json({ ok: true, message: "RLHF update triggered", updatedWeights: getRLHFState() });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
