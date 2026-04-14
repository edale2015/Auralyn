/**
 * Command Center Routes — /api/command-center/*
 * Multi-patient ranking · deterioration · interventions · RLHF · clinical brain
 * + Article 28b/28c: simulation · sepsis engine · ICU predictor · hospital coordination
 *
 * Phase 1 Security Fix: All endpoints now require physician or admin role.
 * Previously, ICU allocation, RLHF reset, and clinical brain endpoints were
 * accessible without any authentication.
 */

import express from "express";
import { requireRole } from "../middleware/requireRole";
import { requireClinicAccess } from "../middleware/requireClinicAccess";
import { rankPatientsAI, computePriorityScore } from "../command-center/commandCenterAI";
import { predictDeterioration, handleDeterioration } from "../prediction/deteriorationEngine";
import { runInterventions }                          from "../intervention/actionOrchestrator";
import { runLearningLoop, getLearningStats, getOutcomeLog, getWeights } from "../learning/rlhfClinicalEngine";
import { runClinicalBrain }                          from "../orchestrator/fullClinicalBrain";
import { getAlertLog, getCriticalAlerts }            from "../intervention/alertEngine";
import { getEscalationLog }                          from "../intervention/escalationEngine";
import { getOrderAuditLog }                          from "../intervention/orderExecutor";
// Article 28b — simulation + clinical engines
import { simulatePatients, runDigitalTwin }          from "../simulation/multiPatientSimulator";
import { generatePatient, generateMixedCohort }      from "../simulation/patientGenerator";
import { calculateNEWS2, calculateQSOFA, detectSepsis } from "../clinical/sepsisEngine";
import { predictICUNeed }                            from "../clinical/icuPredictor";
import { runValidation, runCohortValidation }        from "../evals/validationHarness";
import { updateWeights, getWeights as getRLHFWeights, getUpdateHistory, resetWeights } from "../rlhf/weightUpdater";
// Article 28c — hospital coordination
import { getAllHospitals, getTotalAvailableBeds, getSystemOccupancy, updateBedCount } from "../coordination/hospitalRegistry";
import { allocateICUBed, releaseICUBed, getNetworkStatus, getAllAllocations }          from "../coordination/bedAllocator";

const router = express.Router();

// ── Global auth guard ─────────────────────────────────────────────────────────
// All command-center routes require at minimum physician or admin role.
// These endpoints expose patient prioritization, ICU allocation, RLHF weights,
// and the clinical brain — none should be accessible without authentication.
router.use(requireRole(["admin", "physician"]));
router.use(requireClinicAccess);

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

// ══ Article 28b — Multi-patient simulation ════════════════════════════════════

router.post("/simulate", async (req, res) => {
  try {
    const { n = 1000 } = req.body as { n?: number };
    const result = await simulatePatients(Math.min(n, 10_000));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get("/twin", async (req, res) => {
  try {
    const n = parseInt((req.query.n as string) ?? "200");
    const projections = await runDigitalTwin(Math.min(n, 1000));
    res.json({ projections, count: projections.length });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── Sepsis clinical engines ───────────────────────────────────────────────────

router.post("/sepsis/news2", (req, res) => {
  try {
    const { vitals } = req.body;
    if (!vitals) return void res.status(400).json({ error: "vitals required" });
    res.json(calculateNEWS2(vitals));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post("/sepsis/qsofa", (req, res) => {
  try {
    const { vitals, mentalStatus = "normal" } = req.body;
    if (!vitals) return void res.status(400).json({ error: "vitals required" });
    res.json(calculateQSOFA(vitals, mentalStatus));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post("/sepsis/detect", (req, res) => {
  try {
    const { vitals, labs, mentalStatus = "normal" } = req.body;
    if (!vitals || !labs) return void res.status(400).json({ error: "vitals and labs required" });
    res.json(detectSepsis(vitals, labs, mentalStatus));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post("/icu/predict", (req, res) => {
  try {
    const { vitals, labs, mentalStatus = "normal" } = req.body;
    if (!vitals || !labs) return void res.status(400).json({ error: "vitals and labs required" });
    const sepsis = detectSepsis(vitals, labs, mentalStatus);
    const icu    = predictICUNeed({ vitals, labs }, sepsis);
    res.json({ sepsis, icu });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── Validation harness ────────────────────────────────────────────────────────

router.post("/validate", (req, res) => {
  try {
    const patient = req.body.patient ?? req.body;
    if (!patient?.vitals || !patient?.labs) {
      return void res.json(runValidation(generatePatient()));
    }
    if (!patient.id) patient.id = `p_${Date.now()}`;
    if (!patient.age) patient.age = 40;
    if (!patient.symptoms) patient.symptoms = [];
    res.json(runValidation(patient));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post("/validate/cohort", (req, res) => {
  try {
    const { patients, n } = req.body as { patients?: unknown[]; n?: number };
    const cohort = Array.isArray(patients) && patients.length > 0
      ? patients as Parameters<typeof runCohortValidation>[0]
      : generateMixedCohort(Math.min(n ?? 100, 5000));
    res.json(runCohortValidation(cohort));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── RLHF weight updater (Article 28b) ────────────────────────────────────────

router.post("/rlhf/update", (req, res) => {
  try {
    const { results, feature } = req.body as {
      results?: Array<{ correct: boolean; errors?: string[] }>; feature?: string;
    };
    if (!Array.isArray(results)) return void res.status(400).json({ error: "results[] required" });
    res.json(updateWeights(results, feature as any));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get("/rlhf/batch-weights", (_req, res) => {
  res.json({ weights: getRLHFWeights() });
});

router.get("/rlhf/update-history", (_req, res) => {
  res.json({ history: getUpdateHistory() });
});

// RLHF reset is admin-only — physicians should not be able to wipe learned weights
router.post("/rlhf/reset", requireRole(["admin"]), (_req, res) => {
  resetWeights();
  res.json({ ok: true });
});

// ══ Article 28c — Hospital coordination ══════════════════════════════════════

router.get("/hospitals", (_req, res) => {
  res.json({
    hospitals:      getAllHospitals(),
    totalAvailable: getTotalAvailableBeds(),
    occupancy:      getSystemOccupancy(),
  });
});

router.get("/hospitals/status", (_req, res) => {
  res.json(getNetworkStatus());
});

router.post("/hospitals/allocate", (req, res) => {
  const { patientId, urgency = "urgent", specialty } = req.body as {
    patientId?: string; urgency?: string; specialty?: string;
  };
  if (!patientId) return void res.status(400).json({ error: "patientId required" });
  const result = allocateICUBed({ patientId, urgency: urgency as any, specialty });
  res.status(result.assigned ? 200 : 503).json(result);
});

router.post("/hospitals/release", (req, res) => {
  const { allocationId, reason = "admitted" } = req.body as {
    allocationId?: string; reason?: string;
  };
  if (!allocationId) return void res.status(400).json({ error: "allocationId required" });
  const ok = releaseICUBed(allocationId, reason as any);
  if (!ok) return void res.status(404).json({ error: "Allocation not found or already released" });
  res.json({ ok: true });
});

router.patch("/hospitals/:id/beds", (req, res) => {
  const { available } = req.body as { available?: number };
  if (available === undefined) return void res.status(400).json({ error: "available required" });
  const ok = updateBedCount(req.params.id, available);
  if (!ok) return void res.status(404).json({ error: "Hospital not found" });
  res.json({ ok: true });
});

router.get("/hospitals/allocations", (_req, res) => {
  res.json({ allocations: getAllAllocations() });
});

export default router;
