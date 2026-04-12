/**
 * Hospital Ops Routes — /api/hospital/*
 * Multi-patient wall, sepsis engine, digital twin, ICU allocation, hospital routing,
 * RL engine, EMS pipeline, hospital optimizer, hospital brain
 */

import express      from "express";
import { detectSepsisRisk }          from "../sepsis/sepsisEngine";
import { triggerSepsisAlert, getSepsisAlertLog } from "../sepsis/sepsisAlertService";
import { updateWallDisplay }         from "../controlTower/multiPatientStream";
import { runAutonomousInterventions } from "../intervention/autonomousInterventionEngine";
import { runDigitalTwin }            from "../digitalTwin/digitalTwinEngine";
import { allocateICUBeds }           from "../icu/icuAllocator";
import { routePatients, getSystemCapacity } from "../network/hospitalCoordinator";
import { runSystemCycle }            from "../orchestrator/systemOrchestrator";
import { runHospitalBrain }          from "../orchestrator/hospitalBrain";
import { learnFromOutcome, chooseBestAction, getQTable } from "../rl/rlEngine";
import { validateRLAction, filterSafeActions }           from "../rl/rlSafetyGate";
import { optimizeHospitalFlow }      from "../ops/hospitalOptimizer";
import { ingestEMSCall, ingestBatch, getEMSLog } from "../ems/emsIngestion";
import { routeEMS, routeEMSBatch }   from "../ems/emsRouter";

const router = express.Router();

// ── Wall Display ──────────────────────────────────────────────────────────────
router.post("/wall/update", async (req, res) => {
  try {
    const { patients } = req.body;
    if (!Array.isArray(patients)) { res.status(400).json({ error: "patients[] required" }); return; }
    const enriched = await updateWallDisplay(patients);
    res.json({ success: true, count: enriched.length, patients: enriched });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ── Sepsis Engine ─────────────────────────────────────────────────────────────
router.post("/sepsis/evaluate", async (req, res) => {
  try {
    const patient = req.body;
    if (!patient?.id || !patient?.vitals) { res.status(400).json({ error: "id and vitals required" }); return; }
    const result = detectSepsisRisk(patient);
    if (result.highRisk) await triggerSepsisAlert(patient, result);
    res.json(result);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.post("/sepsis/batch", async (req, res) => {
  try {
    const { patients } = req.body;
    if (!Array.isArray(patients)) { res.status(400).json({ error: "patients[] required" }); return; }
    const results = await Promise.all(patients.map(async (p) => {
      const r = detectSepsisRisk(p);
      if (r.highRisk) await triggerSepsisAlert(p, r);
      return { patientId: p.id, ...r };
    }));
    res.json({ results, highRiskCount: results.filter((r) => r.highRisk).length });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.get("/sepsis/alerts", (_req, res) => {
  res.json({ alerts: getSepsisAlertLog() });
});

// ── Autonomous Interventions ──────────────────────────────────────────────────
router.post("/interventions/autonomous", async (req, res) => {
  try {
    const { patient } = req.body;
    if (!patient?.id) { res.status(400).json({ error: "patient.id required" }); return; }
    const results = await runAutonomousInterventions(patient);
    res.json({ patientId: patient.id, interventions: results });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ── Digital Twin ──────────────────────────────────────────────────────────────
router.post("/twin/simulate", (req, res) => {
  try {
    const { patient, horizonMinutes } = req.body;
    if (!patient?.id || !patient?.vitals) { res.status(400).json({ error: "patient.id and patient.vitals required" }); return; }
    const result = runDigitalTwin(patient, horizonMinutes ?? 180);
    res.json(result);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.post("/twin/batch", (req, res) => {
  try {
    const { patients, horizonMinutes } = req.body;
    if (!Array.isArray(patients)) { res.status(400).json({ error: "patients[] required" }); return; }
    const results = patients.map((p) => runDigitalTwin(p, horizonMinutes ?? 180));
    res.json({ results, patientsAtRisk: results.filter((r) => r.riskSummary !== "STABLE").length });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ── ICU Allocator ─────────────────────────────────────────────────────────────
router.post("/icu/allocate", (req, res) => {
  try {
    const { patients, beds } = req.body;
    if (!Array.isArray(patients) || !Array.isArray(beds)) { res.status(400).json({ error: "patients[] and beds[] required" }); return; }
    const assignments = allocateICUBeds(patients, beds);
    res.json({ assignments, count: assignments.length });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ── Hospital Routing ──────────────────────────────────────────────────────────
router.post("/route", (req, res) => {
  try {
    const { patients, hospitals } = req.body;
    if (!Array.isArray(patients) || !Array.isArray(hospitals)) { res.status(400).json({ error: "patients[] and hospitals[] required" }); return; }
    const routing = routePatients(patients, hospitals);
    const capacity = getSystemCapacity(hospitals);
    res.json({ routing, capacity });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ── System Orchestrator ───────────────────────────────────────────────────────
router.post("/system/cycle", async (req, res) => {
  try {
    const { patients, beds, hospitals } = req.body;
    if (!Array.isArray(patients)) { res.status(400).json({ error: "patients[] required" }); return; }
    const snapshot = await runSystemCycle(patients, beds ?? [], hospitals ?? []);
    res.json(snapshot);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ── Hospital Brain ────────────────────────────────────────────────────────────
router.post("/brain", async (req, res) => {
  try {
    const { patients, beds, hospitals, emsCalls } = req.body;
    if (!Array.isArray(patients)) { res.status(400).json({ error: "patients[] required" }); return; }
    const snapshot = await runHospitalBrain(patients, beds ?? [], hospitals ?? [], emsCalls ?? []);
    res.json(snapshot);
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ── RL Engine ─────────────────────────────────────────────────────────────────
router.post("/rl/learn", async (req, res) => {
  try {
    const { state, action, outcome } = req.body;
    if (!state || !action || !outcome) { res.status(400).json({ error: "state, action, outcome required" }); return; }
    const gate = validateRLAction(action);
    if (!gate.safe) { res.status(403).json({ error: gate.reason }); return; }
    const reward = await learnFromOutcome(state, action, outcome);
    res.json({ reward, action, learned: true });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.post("/rl/recommend", async (req, res) => {
  try {
    const { state, actions } = req.body;
    if (!state || !Array.isArray(actions)) { res.status(400).json({ error: "state and actions[] required" }); return; }
    const safeActions = filterSafeActions(actions);
    const best = await chooseBestAction(state, safeActions);
    const gate = validateRLAction(best);
    res.json({ recommended: best, requiresPhysician: gate.requiresPhysician, safeActions });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.post("/rl/validate", (req, res) => {
  const { action } = req.body;
  res.json(validateRLAction(action ?? ""));
});

router.get("/rl/table", async (_req, res) => {
  const table = await getQTable();
  res.json({ entries: Object.keys(table).length, table });
});

// ── Hospital Optimizer ────────────────────────────────────────────────────────
router.post("/ops/optimize", (req, res) => {
  try {
    const { patients, beds } = req.body;
    if (!Array.isArray(patients) || !Array.isArray(beds)) { res.status(400).json({ error: "patients[] and beds[] required" }); return; }
    res.json(optimizeHospitalFlow(patients, beds));
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ── EMS Pipeline ──────────────────────────────────────────────────────────────
router.post("/ems/ingest", (req, res) => {
  try {
    const call = req.body;
    if (!call?.id || !call?.vitals) { res.status(400).json({ error: "EMS call id and vitals required" }); return; }
    res.json(ingestEMSCall(call));
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.post("/ems/batch", (req, res) => {
  try {
    const { calls } = req.body;
    if (!Array.isArray(calls)) { res.status(400).json({ error: "calls[] required" }); return; }
    res.json({ patients: ingestBatch(calls) });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.post("/ems/route", (req, res) => {
  try {
    const { call, hospitals } = req.body;
    if (!call?.id || !Array.isArray(hospitals)) { res.status(400).json({ error: "call and hospitals[] required" }); return; }
    const ingested = ingestEMSCall(call);
    res.json(routeEMS(ingested, hospitals));
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.get("/ems/log", (_req, res) => { res.json({ calls: getEMSLog() }); });

export default router;
