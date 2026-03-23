import express from "express";
import { executeClinicalAction } from "../orchestrator/decisionBridge";
import { unifySystemsAndDecide } from "../orchestrator/globalBrain";
import { clinicalSafetyCheck, batchGuardrailCheck } from "../clinical/guardrails";
import { analyzeFrame, verifyToolAlignment } from "../robotics/vision";
import { runBrain, getBrainAgentConfig } from "../brain/autonomousBrain";
import { clinicalReasoning } from "../orchestrator/clinicalFusion";
import { listAgentConfigs } from "../agents/selfModify";
import { runSystem } from "../brain/fullLoop";
import { runWorkflow } from "../workflows/workflowEngine";
import { clinicalSafetyGate } from "../clinical/safetyGate";
import { computePerformance, getOutcomeLog, logOutcome } from "../learning/outcomeTracker";
import { getMetricsSummary } from "../monitoring/metrics";
import { aggregate, trainLocalModel } from "../federation/aggregator";

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

router.post("/full-loop", async (req, res) => {
  try {
    const result = await runSystem({
      id: req.body.patientId ?? `anon-${Date.now()}`,
      complaints: req.body.complaints ?? [],
      text: req.body.text,
      image: req.body.image ?? null,
      audio: req.body.audio ?? null,
      vitals: req.body.vitals,
      history: req.body.history,
      requestedWorkflow: req.body.workflow,
    });
    res.json({ ok: true, result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/workflow", async (req, res) => {
  try {
    const { type, patientId, ...rest } = req.body;
    const result = await runWorkflow(type ?? "triage", { patientId: patientId ?? `anon-${Date.now()}`, ...rest });
    res.json({ ok: true, result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/safety-gate", async (req, res) => {
  try {
    const result = clinicalSafetyGate(req.body);
    res.json({ ok: true, result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/metrics", async (_req, res) => {
  try {
    const summary = getMetricsSummary();
    const performance = computePerformance();
    res.json({ ok: true, metrics: summary, performance });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/outcomes", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const outcomes = getOutcomeLog(limit);
    const performance = computePerformance();
    res.json({ ok: true, outcomes, performance });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/outcomes", async (req, res) => {
  try {
    const { caseId, ...outcome } = req.body;
    logOutcome(caseId ?? `case-${Date.now()}`, outcome);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/federated/aggregate", async (req, res) => {
  try {
    const { models } = req.body;
    const result = aggregate(models ?? []);
    res.json({ ok: true, result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/brain-run", async (req, res) => {
  try {
    const { patientId, complaints, vitals, history, embedding } = req.body;
    const result = await runBrain({
      patientId: patientId ?? `anon-${Date.now()}`,
      complaints: complaints ?? [],
      vitals,
      history,
      embedding,
    });
    res.json({ ok: true, result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/clinical-fusion", async (req, res) => {
  try {
    const { patientId, complaints, vitals, history, embedding } = req.body;
    const result = await clinicalReasoning({
      patientId,
      complaints: complaints ?? [],
      vitals,
      history,
      embedding,
    });
    res.json({ ok: true, result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/brain-config", async (_req, res) => {
  try {
    const config = getBrainAgentConfig();
    const agents = listAgentConfigs();
    res.json({ ok: true, config, agents });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
