/**
 * Command Center Routes — /api/command-center/*
 * Multi-patient ranking · deterioration · interventions · RLHF · clinical brain
 */

import express from "express";
import { rankPatientsAI, computePriorityScore } from "../command-center/commandCenterAI";
import { predictDeterioration, handleDeterioration } from "../prediction/deteriorationEngine";
import { runInterventions }                          from "../intervention/actionOrchestrator";
import { runLearningLoop, getLearningStats, getOutcomeLog, getWeights } from "../learning/rlhfClinicalEngine";
import { runClinicalBrain }                          from "../orchestrator/fullClinicalBrain";
import { getAlertLog, getCriticalAlerts }            from "../intervention/alertEngine";
import { getEscalationLog }                          from "../intervention/escalationEngine";
import { getOrderAuditLog }                          from "../intervention/orderExecutor";

const router = express.Router();

// ── POST /api/command-center/rank — priority-rank a list of patients ──────────
router.post("/rank", (req, res) => {
  try {
    const { patients } = req.body;
    if (!Array.isArray(patients)) { res.status(400).json({ error: "patients array required" }); return; }
    res.json({ success: true, patients: rankPatientsAI(patients) });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── POST /api/command-center/deterioration — predict one patient ──────────────
router.post("/deterioration", async (req, res) => {
  try {
    const { patient, autoAct = false } = req.body;
    if (!patient?.vitals) { res.status(400).json({ error: "patient.vitals required" }); return; }

    const result = autoAct
      ? await handleDeterioration(patient)
      : predictDeterioration(patient);

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── POST /api/command-center/interventions — execute intervention pipeline ─────
router.post("/interventions", async (req, res) => {
  try {
    const { patient } = req.body;
    if (!patient?.id || !patient?.vitals) { res.status(400).json({ error: "patient.id + patient.vitals required" }); return; }

    const result = await runInterventions(patient);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── POST /api/command-center/brain — full multi-patient clinical brain ─────────
router.post("/brain", async (req, res) => {
  try {
    const { patients } = req.body;
    if (!Array.isArray(patients) || patients.length === 0) { res.status(400).json({ error: "patients array required" }); return; }

    const result = await runClinicalBrain(patients);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── POST /api/command-center/learn — submit case outcome for RLHF ─────────────
router.post("/learn", async (req, res) => {
  try {
    const { patientId, predictedDisposition, actualDisposition, predictedRisk, outcome, physicianOverride, overrideReason } = req.body;
    if (!patientId || !predictedDisposition || !actualDisposition || !outcome) {
      res.status(400).json({ error: "patientId, predictedDisposition, actualDisposition, outcome required" });
      return;
    }

    const result = await runLearningLoop({
      patientId, predictedDisposition, actualDisposition,
      predictedRisk: predictedRisk ?? "unknown",
      outcome, physicianOverride, overrideReason,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── GET /api/command-center/learn/stats — RLHF learning stats ────────────────
router.get("/learn/stats", (_req, res) => {
  res.json(getLearningStats());
});

// ── GET /api/command-center/learn/weights — current clinical weights ──────────
router.get("/learn/weights", (_req, res) => {
  res.json(getWeights());
});

// ── GET /api/command-center/alerts — alert log ───────────────────────────────
router.get("/alerts", (_req, res) => {
  res.json({ alerts: getAlertLog(), criticalAlerts: getCriticalAlerts() });
});

// ── GET /api/command-center/escalations — escalation log ─────────────────────
router.get("/escalations", (_req, res) => {
  res.json({ escalations: getEscalationLog() });
});

// ── GET /api/command-center/orders — order audit log ─────────────────────────
router.get("/orders", (_req, res) => {
  res.json({ orders: getOrderAuditLog() });
});

export default router;
