import { Router } from "express";
import { runClinicFlow, scheduleFollowUp } from "./clinicOrchestrator";

const router = Router();

router.post("/run", async (req, res) => {
  try {
    const { text, patientId, caseId, source, zip } = req.body;
    if (!text) return res.status(400).json({ ok: false, error: "text required" });
    const result = await runClinicFlow({ text, patientId, caseId, source, zip });
    res.json({ ok: true, result });
  } catch (err: any) {
    console.error("[ClinicOrchestrator] Error:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/schedule", (req, res) => {
  const followUp = scheduleFollowUp({ riskScore: req.body.riskScore });
  res.json({ ok: true, followUp });
});

export default router;
