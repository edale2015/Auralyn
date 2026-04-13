/**
 * ICU Control Tower API Routes
 * Provides risk-ranked patient lists, ICU bed allocation, EMS routing,
 * and digital twin simulation endpoints.
 */

import { Router } from "express";
import { requireRole } from "../middleware/requireRole";
import { rankPatients, getPatientSummary } from "../icu/patientCommandCenter";
import { simulatePatient } from "../icu/digitalTwin";
import { routePatient } from "../icu/emsRouter";

const router = Router();

// Sample patient data for demo — in production, sourced from live patient sessions
function getDemoPatients() {
  return [
    {
      id: "p1",
      vitals: { hr: 122, rr: 31, spo2: 87, temp: 39.1, sbp: 84 },
      symptoms: ["fever", "shortness of breath", "altered mental status"],
      labs: { lactate: 3.2, wbc: 18 },
    },
    {
      id: "p2",
      vitals: { hr: 98, rr: 22, spo2: 93, temp: 38.2, sbp: 110 },
      symptoms: ["chest pain", "diaphoresis"],
      labs: { lactate: 1.4 },
    },
    {
      id: "p3",
      vitals: { hr: 78, rr: 16, spo2: 98, temp: 37.0, sbp: 128 },
      symptoms: ["cough", "runny nose"],
    },
  ];
}

/** GET /api/icu/patients — ranked patient list by deterioration score */
router.get("/patients", requireRole("physician"), (_req, res) => {
  const patients = getDemoPatients();
  const summary = getPatientSummary(patients as any);
  res.json(summary);
});

/** GET /api/icu/ranked — alias for /patients */
router.get("/ranked", (_req, res) => {
  const patients = getDemoPatients();
  res.json(rankPatients(patients as any));
});

/** POST /api/icu/simulate — digital twin simulation for a specific patient */
router.post("/simulate", requireRole("physician"), (req, res) => {
  const { patient, hours = 6 } = req.body;
  if (!patient || !patient.id || !patient.vitals) {
    return res.status(400).json({ error: "patient with id and vitals required" });
  }
  const simulation = simulatePatient(patient, hours);
  res.json(simulation);
});

/** POST /api/icu/route — EMS hospital routing for a patient */
router.post("/route", requireRole("physician"), (req, res) => {
  const { patient, hospitals } = req.body;
  if (!patient || !hospitals?.length) {
    return res.status(400).json({ error: "patient and hospitals[] required" });
  }
  const decision = routePatient(patient, hospitals);
  res.json(decision ?? { error: "No eligible hospitals with available beds" });
});

export default router;
