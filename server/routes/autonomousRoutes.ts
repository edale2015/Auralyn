import express from "express";
import { executeClinicalAction } from "../orchestrator/decisionBridge";
import { unifySystemsAndDecide } from "../orchestrator/globalBrain";
import { clinicalSafetyCheck, batchGuardrailCheck } from "../clinical/guardrails";
import { analyzeFrame, verifyToolAlignment } from "../robotics/vision";

const router = express.Router();

router.post("/simulate", async (req, res) => {
  try {
    const { patientId, complaints, vitalSigns, age, riskFactors } = req.body;

    const result = await executeClinicalAction({
      patientId: patientId ?? `sim-${Date.now()}`,
      complaints: complaints ?? ["ear_pain"],
      vitalSigns,
      age,
      riskFactors,
    });

    res.json({ ok: true, result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/brain", async (_req, res) => {
  try {
    const state = await unifySystemsAndDecide();
    res.json({ ok: true, state });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/guardrail-check", async (req, res) => {
  try {
    const { action } = req.body;
    const result = clinicalSafetyCheck(action);
    res.json({ ok: true, result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/guardrail-batch", async (req, res) => {
  try {
    const { actions } = req.body;
    const result = batchGuardrailCheck(actions ?? []);
    res.json({ ok: true, result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/vision/analyze", async (req, res) => {
  try {
    const { tool, patientId } = req.body;
    const result = await analyzeFrame({ tool: tool ?? "otoscope", patientId });
    res.json({ ok: true, result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/vision/alignment", async (req, res) => {
  try {
    const { tool, pose } = req.body;
    const result = await verifyToolAlignment(tool ?? "otoscope", pose ?? { x: 0, y: 0, z: 0 });
    res.json({ ok: true, result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
