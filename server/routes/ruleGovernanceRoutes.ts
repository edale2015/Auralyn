import express from "express";
import { getRuleGovernanceSummary } from "../services/ruleGovernanceService";

const router = express.Router();

router.get("/api/skill-layer/rule-governance", async (_req, res) => {
  try {
    const summary = await getRuleGovernanceSummary();
    res.json({ ok: true, summary });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message ?? "unknown_error" });
  }
});

export default router;
