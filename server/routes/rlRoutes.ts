import { Router } from "express";
import { trainDispositionPolicy, getCurrentPolicy, getPolicyHistoryLog, getPolicySummary } from "../learning/reinforcementPolicyService";

const router = Router();

router.get("/api/rl/policy", async (_req, res) => {
  try {
    const policy = await getCurrentPolicy();
    const summary = await getPolicySummary();
    res.json({ policy, summary });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/api/rl/train", async (_req, res) => {
  try {
    const snapshot = await trainDispositionPolicy();
    res.json({ ok: true, snapshot });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/api/rl/policy-history", async (_req, res) => {
  try {
    const history = await getPolicyHistoryLog();
    res.json({ history });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/api/rl/summary", async (_req, res) => {
  try {
    res.json(await getPolicySummary());
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
