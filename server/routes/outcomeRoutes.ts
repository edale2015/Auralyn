import express from "express";
import { recordCaseOutcome } from "../skills/outcomes/recordCaseOutcome";
import { linkFollowUpResult } from "../skills/outcomes/linkFollowUpResult";

const router = express.Router();

router.post("/api/skill-layer/outcome", async (req, res) => {
  try {
    const result = await recordCaseOutcome(req.body);
    res.json({ ok: true, result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message ?? "unknown_error" });
  }
});

router.post("/api/skill-layer/followup", async (req, res) => {
  try {
    const result = await linkFollowUpResult(req.body);
    res.json({ ok: true, result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message ?? "unknown_error" });
  }
});

export default router;
