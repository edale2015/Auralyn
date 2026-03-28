import { Router } from "express";
import { checkEligibility, getEligibilityHistory, getEligibilityStats } from "../eligibility/eligibilityEngine";

const router = Router();

router.post("/verify", async (req, res) => {
  try {
    const { patientId, payer, memberId } = req.body;
    if (!patientId || !payer) return res.status(400).json({ ok: false, error: "patientId and payer required" });
    const result = await checkEligibility({ patientId, payer, memberId });
    res.json({ ok: true, result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/history", (_req, res) => {
  res.json({ ok: true, history: getEligibilityHistory(30), stats: getEligibilityStats() });
});

router.get("/stats", (_req, res) => {
  res.json({ ok: true, stats: getEligibilityStats() });
});

export default router;
