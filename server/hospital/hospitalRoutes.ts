/**
 * Hospital Routes — /api/hospital/*
 */

import express from "express";
import { runHospitalAgent, getActionLog, resolveAction, getAgentStats } from "./hospitalAgent";
import { getHospitalCapacity, getOccupancyReport, listBeds, admitPatient, dischargePatient, markBedAvailable } from "./bedManagement";
import { getStaffingSummary, listStaff, addStaff, updatePatientCounts }  from "./staffingEngine";
import { getScheduleSummary, listAppointments, bookAppointment, cancelAppointment, updateStatus, estimateWaitTime } from "./schedulingEngine";
import { getPopulationSummary, listPatients, analyzeConditionCohort, getReadmissionAlerts, addPatient } from "./populationHealth";

const router = express.Router();

// ── Status ────────────────────────────────────────────────────────────────────
router.get("/status", async (_req, res) => {
  try {
    const [capacity, staffing, scheduling, population, agentStats] = await Promise.all([
      Promise.resolve(getHospitalCapacity()),
      Promise.resolve(getStaffingSummary()),
      Promise.resolve(getScheduleSummary()),
      Promise.resolve(getPopulationSummary()),
      Promise.resolve(getAgentStats()),
    ]);
    res.json({ capacity, staffing: { activeStaff: staffing.activeStaff, alerts: staffing.alerts.length, deficit: staffing.totalDeficit }, scheduling, population: { totalPatients: population.totalPatients, highRisk: population.byRiskTier.HIGH + population.byRiskTier.VERY_HIGH }, agent: agentStats, timestamp: new Date().toISOString() });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ── Bed Management ────────────────────────────────────────────────────────────
router.get("/beds", (req, res) => {
  const { unit, status, type } = req.query as Record<string, string>;
  res.json(listBeds({ unit: unit as any, status: status as any, type: type as any }));
});

router.get("/beds/capacity", (_req, res) => {
  res.json({ capacity: getHospitalCapacity(), byUnit: getOccupancyReport() });
});

router.post("/beds/admit", (req, res) => {
  const result = admitPatient(req.body);
  if (!result.ok) { res.status(409).json({ error: result.error }); return; }
  res.json(result.bed);
});

router.post("/beds/:id/discharge", (req, res) => {
  const result = dischargePatient(req.params.id);
  if (!result.ok) { res.status(400).json({ error: result.error }); return; }
  res.json({ ok: true });
});

router.post("/beds/:id/available", (req, res) => {
  res.json({ ok: markBedAvailable(req.params.id) });
});

// ── Scheduling ────────────────────────────────────────────────────────────────
router.get("/schedule", (req, res) => {
  const { providerId, status, date } = req.query as Record<string, string>;
  res.json(listAppointments({ providerId, status: status as any, date }));
});

router.get("/schedule/summary", (_req, res) => {
  res.json(getScheduleSummary());
});

router.post("/schedule", (req, res) => {
  try {
    res.status(201).json(bookAppointment(req.body));
  } catch (err) { res.status(400).json({ error: String(err) }); }
});

router.delete("/schedule/:id", (req, res) => {
  res.json({ ok: cancelAppointment(req.params.id) });
});

router.patch("/schedule/:id/status", (req, res) => {
  res.json({ ok: updateStatus(req.params.id, req.body.status) });
});

router.get("/schedule/wait/:patientId", (req, res) => {
  const priority = Number(req.query.priority ?? 3) as 1|2|3|4|5;
  res.json(estimateWaitTime(req.params.patientId, priority));
});

// ── Staffing ──────────────────────────────────────────────────────────────────
router.get("/staffing", (_req, res) => {
  res.json(getStaffingSummary());
});

router.get("/staffing/staff", (req, res) => {
  const { unit, role } = req.query as Record<string, string>;
  res.json(listStaff({ unit: unit as any, role: role as any }));
});

router.post("/staffing/staff", (req, res) => {
  try {
    res.status(201).json(addStaff(req.body));
  } catch (err) { res.status(400).json({ error: String(err) }); }
});

router.post("/staffing/patient-counts", (req, res) => {
  updatePatientCounts(req.body);
  res.json({ ok: true, updated: req.body });
});

// ── Population Health ──────────────────────────────────────────────────────────
router.get("/population", (_req, res) => {
  res.json(getPopulationSummary());
});

router.get("/population/patients", (req, res) => {
  const { riskTier, condition } = req.query as Record<string, string>;
  res.json(listPatients({ riskTier: riskTier as any, condition: condition as any }));
});

router.get("/population/cohort/:condition", (req, res) => {
  res.json(analyzeConditionCohort(req.params.condition as any));
});

router.get("/population/readmission-alerts", (req, res) => {
  const threshold = Number(req.query.threshold ?? 0.5);
  res.json(getReadmissionAlerts(threshold));
});

router.post("/population/patients", (req, res) => {
  try {
    res.status(201).json(addPatient(req.body));
  } catch (err) { res.status(400).json({ error: String(err) }); }
});

// ── Autonomous Agent ──────────────────────────────────────────────────────────
router.post("/agent/run", async (_req, res) => {
  try {
    res.json(await runHospitalAgent());
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.get("/agent/log", (req, res) => {
  const limit = Number(req.query.limit ?? 50);
  res.json(getActionLog(limit));
});

router.get("/agent/stats", (_req, res) => {
  res.json(getAgentStats());
});

router.post("/agent/resolve/:id", (req, res) => {
  res.json({ ok: resolveAction(req.params.id) });
});

export default router;
