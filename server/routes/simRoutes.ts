/**
 * Simulation Routes
 * Mounted at /api/sim
 *
 * GET  /api/sim/patients        — mock patient cohort
 * POST /api/sim/run             — run reasoner + broadcast via WS
 * POST /api/sim/run/cognitive   — run cognitive brain + broadcast
 * GET  /api/sim/heatmap/:id     — posterior probability for a mock patient
 */

import express from "express";
import { sequentialReasoner }      from "../agents/sequentialClinicalReasoner";
import { broadcastPatientUpdate }  from "../realtime/patientStream";
import { specialistCouncil }       from "../agents/specialistCouncil";

const router = express.Router();

const MOCK_PATIENTS = [
  { id: 1, complaint: "chest pain",     age: 62, vitals: { hr: 110, spo2: 95, systolicBP: 118, tempF: 98.6 }, redFlags: ["diaphoresis"] },
  { id: 2, complaint: "cough and fever",age: 34, vitals: { hr: 92,  spo2: 97, systolicBP: 122, tempF: 101.4 }, redFlags: [] },
  { id: 3, complaint: "dyspnea",        age: 71, vitals: { hr: 105, spo2: 89, systolicBP: 105, tempF: 99.1 }, redFlags: ["hypoxia"] },
  { id: 4, complaint: "headache",       age: 28, vitals: { hr: 74,  spo2: 99, systolicBP: 124, tempF: 98.2 }, redFlags: [] },
  { id: 5, complaint: "sore throat",    age: 19, vitals: { hr: 80,  spo2: 99, systolicBP: 118, tempF: 100.1 }, redFlags: [] },
];

router.get("/patients", (_req, res) => {
  res.json(MOCK_PATIENTS);
});

router.post("/run", async (req, res) => {
  try {
    const input = req.body;
    const result = await sequentialReasoner.run(input);
    broadcastPatientUpdate({ source: "sim", input, result });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post("/run/cognitive", async (req, res) => {
  try {
    const { runCognitiveBrain } = await import("../cognitive/cognitiveOrchestrator");
    const result = await runCognitiveBrain(req.body);
    broadcastPatientUpdate({ source: "cognitive", input: req.body, result });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/** Return a mock Bayesian posterior for visualisation */
router.get("/heatmap/:id", (req, res) => {
  const patient = MOCK_PATIENTS.find((p) => p.id === Number(req.params.id));
  if (!patient) { res.status(404).json({ error: "Patient not found" }); return; }

  // Deterministic pseudo-posterior based on complaint
  const posterior = buildPosterior(patient.complaint, patient.vitals);
  res.json({ patientId: patient.id, complaint: patient.complaint, posterior });
});

router.post("/council", async (req, res) => {
  try {
    const result = await specialistCouncil.evaluate(req.body);
    broadcastPatientUpdate({ source: "council", input: req.body, result });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

function buildPosterior(complaint: string, vitals: Record<string, number>) {
  const c = complaint.toLowerCase();
  if (c.includes("chest")) {
    return [
      { dx: "ACS",             prob: 0.38 },
      { dx: "PE",              prob: 0.22 },
      { dx: "GERD",            prob: 0.18 },
      { dx: "Musculoskeletal", prob: 0.12 },
      { dx: "Anxiety",         prob: 0.10 },
    ];
  }
  if (c.includes("dyspnea") || vitals.spo2 < 92) {
    return [
      { dx: "COPD_Exacerbation", prob: 0.30 },
      { dx: "Pneumonia",         prob: 0.28 },
      { dx: "CHF",               prob: 0.22 },
      { dx: "PE",                prob: 0.12 },
      { dx: "Anxiety",           prob: 0.08 },
    ];
  }
  if (c.includes("fever") || (vitals.tempF ?? 98.6) > 100.4) {
    return [
      { dx: "Viral_URI",     prob: 0.45 },
      { dx: "Pneumonia",     prob: 0.25 },
      { dx: "Strep_Pharyngitis", prob: 0.15 },
      { dx: "UTI",           prob: 0.10 },
      { dx: "Sepsis",        prob: 0.05 },
    ];
  }
  return [
    { dx: "Tension_Headache", prob: 0.40 },
    { dx: "Migraine",         prob: 0.30 },
    { dx: "Viral_URI",        prob: 0.20 },
    { dx: "Other",            prob: 0.10 },
  ];
}

export default router;
