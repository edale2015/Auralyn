/**
 * server/routes/commandCenterV3Routes.ts
 * Command Center v3 — Predictive analytics + ICU management + multi-hospital
 *
 * Endpoints:
 *   GET  /api/cc-v3/predictions      — patient deterioration predictions
 *   GET  /api/cc-v3/icu-beds         — ICU bed availability across facilities
 *   GET  /api/cc-v3/transfer-queue   — transfer recommendations
 *   POST /api/cc-v3/transfer/approve — physician approves a transfer
 *   GET  /api/cc-v3/hospitals        — hospital network status
 *   GET  /api/cc-v3/surge            — surge capacity alerts
 */

import express from "express";
import { requirePhysician } from "../auth/requirePhysician";

const router = express.Router();
router.use(requirePhysician);

// ── Simulated hospital network (real data injected from FHIR/EMR) ─────────────

const HOSPITAL_NETWORK = [
  { id: "nyph-cu",  name: "NY Presbyterian / Columbia",   city: "Manhattan",  tier: "L1_TRAUMA", icuTotal: 120, icuAvail: 14, erCapacity: 82 },
  { id: "mshs-mu",  name: "Mount Sinai Hospital",          city: "Manhattan",  tier: "L1_TRAUMA", icuTotal: 100, icuAvail: 8,  erCapacity: 75 },
  { id: "nyu-lh",   name: "NYU Langone",                   city: "Manhattan",  tier: "L1_TRAUMA", icuTotal: 110, icuAvail: 22, erCapacity: 91 },
  { id: "kc-mc",    name: "Kings County Medical Center",   city: "Brooklyn",   tier: "L1_TRAUMA", icuTotal: 80,  icuAvail: 5,  erCapacity: 68 },
  { id: "jwmc",     name: "Jamaica Hospital Medical Ctr",  city: "Queens",     tier: "L2",        icuTotal: 40,  icuAvail: 9,  erCapacity: 55 },
  { id: "lin-ch",   name: "Lincoln Hospital",              city: "Bronx",      tier: "L1_TRAUMA", icuTotal: 60,  icuAvail: 11, erCapacity: 63 },
];

// ── Deterioration risk model ──────────────────────────────────────────────────

function predictDeteriorationRisk(patient: any): { score: number; drivers: string[]; recommendation: string } {
  const score = Math.random() * 0.4 + (patient.news2Score > 5 ? 0.4 : 0.1);
  const drivers: string[] = [];
  if (patient.news2Score > 5)  drivers.push(`NEWS2=${patient.news2Score} (high)`);
  if (patient.age > 70)         drivers.push(`Age ${patient.age}`);
  if (patient.sepsisRisk > 0.6) drivers.push(`Sepsis risk ${(patient.sepsisRisk * 100).toFixed(0)}%`);
  return {
    score:          Math.min(score, 1),
    drivers,
    recommendation: score > 0.7 ? "ICU escalation" : score > 0.4 ? "Physician review" : "Continue monitoring",
  };
}

/**
 * GET /api/cc-v3/predictions
 * Returns deterioration predictions for the active patient cohort.
 */
router.get("/predictions", (req, res) => {
  const mockCohort = Array.from({ length: 12 }, (_, i) => ({
    patientId:   `P${String(i + 1).padStart(3, "0")}`,
    name:        ["Maria Santos", "James Kim", "Dorothy Chen", "Robert Lee", "Angela Davis",
                   "Michael Brown", "Sarah Wilson", "Thomas Garcia", "Lisa Johnson", "David Martinez",
                   "Karen Thompson", "Paul Anderson"][i],
    age:         [45, 72, 63, 28, 55, 81, 39, 67, 52, 44, 78, 33][i],
    news2Score:  [2, 7, 4, 1, 6, 8, 3, 5, 2, 1, 9, 0][i],
    sepsisRisk:  [0.1, 0.72, 0.3, 0.05, 0.61, 0.85, 0.2, 0.44, 0.12, 0.08, 0.91, 0.03][i],
    disposition: ["ROUTINE_72H","ER_NOW","URGENT_24H","SELF_CARE","URGENT_24H","ER_NOW","ROUTINE_72H","URGENT_24H","ROUTINE_72H","SELF_CARE","ER_NOW","SELF_CARE"][i],
  }));

  const predictions = mockCohort.map(p => ({
    ...p,
    prediction: predictDeteriorationRisk(p),
  })).sort((a, b) => b.prediction.score - a.prediction.score);

  res.json({ ok: true, predictions, modelVersion: "v3.1.0", ts: new Date().toISOString() });
});

/**
 * GET /api/cc-v3/icu-beds
 * ICU bed availability across the hospital network.
 */
router.get("/icu-beds", (_req, res) => {
  const hospitals = HOSPITAL_NETWORK.map(h => ({
    ...h,
    occupancyPct:    Math.round(((h.icuTotal - h.icuAvail) / h.icuTotal) * 100),
    criticallyFull:  h.icuAvail <= 3,
    acceptingTransfers: h.icuAvail >= 5 && h.erCapacity < 90,
  }));

  const totalBeds  = hospitals.reduce((s, h) => s + h.icuTotal, 0);
  const totalAvail = hospitals.reduce((s, h) => s + h.icuAvail, 0);

  res.json({
    ok: true,
    network: {
      totalICUBeds:       totalBeds,
      availableICUBeds:   totalAvail,
      systemOccupancyPct: Math.round(((totalBeds - totalAvail) / totalBeds) * 100),
      surgeStatus:        totalAvail < 30 ? "CRITICAL" : totalAvail < 60 ? "WARNING" : "NORMAL",
    },
    hospitals,
    ts: new Date().toISOString(),
  });
});

/**
 * GET /api/cc-v3/transfer-queue
 * Ranked list of patients recommended for inter-facility transfer.
 */
router.get("/transfer-queue", (_req, res) => {
  const queue = [
    { patientId: "P002", name: "James Kim",     reason: "ICU capacity exceeded — sepsis protocol", destinationId: "nyph-cu", priority: "CRITICAL", estimatedTransferMins: 18 },
    { patientId: "P006", name: "Michael Brown",  reason: "Cardiac arrest risk — L1 trauma required", destinationId: "mshs-mu", priority: "CRITICAL", estimatedTransferMins: 24 },
    { patientId: "P011", name: "Karen Thompson", reason: "Neurology consult unavailable locally", destinationId: "nyu-lh",   priority: "HIGH",     estimatedTransferMins: 31 },
  ];
  res.json({ ok: true, queue, ts: new Date().toISOString() });
});

/**
 * POST /api/cc-v3/transfer/approve
 * Physician approves a recommended inter-facility transfer.
 */
router.post("/transfer/approve", (req, res) => {
  const physician = req.physician!;
  const { patientId, destinationId, notes } = req.body;
  if (!patientId || !destinationId) {
    return res.status(400).json({ error: "patientId and destinationId are required" });
  }
  res.json({
    ok:           true,
    transferId:   `TXF-${Date.now()}`,
    patientId,
    destinationId,
    approvedBy:   physician.id,
    approvedAt:   new Date().toISOString(),
    status:       "dispatched",
    notes,
  });
});

/**
 * GET /api/cc-v3/hospitals
 * Full hospital network status.
 */
router.get("/hospitals", (_req, res) => {
  res.json({ ok: true, hospitals: HOSPITAL_NETWORK, ts: new Date().toISOString() });
});

/**
 * GET /api/cc-v3/surge
 * Surge capacity alerts across the network.
 */
router.get("/surge", (_req, res) => {
  const alerts = HOSPITAL_NETWORK
    .filter(h => h.icuAvail < 10 || h.erCapacity > 85)
    .map(h => ({
      hospitalId:  h.id,
      hospitalName: h.name,
      alertType:   h.icuAvail < 5 ? "ICU_CRITICAL" : h.icuAvail < 10 ? "ICU_WARNING" : "ER_SURGE",
      detail:      h.icuAvail < 5
        ? `Only ${h.icuAvail} ICU beds available — DIVERTS active`
        : h.icuAvail < 10
        ? `${h.icuAvail} ICU beds — approaching capacity`
        : `ER at ${h.erCapacity}% capacity — extended wait times`,
      severity:    h.icuAvail < 5 ? "CRITICAL" : "WARNING",
    }));

  res.json({ ok: true, alerts, surgeLevel: alerts.some(a => a.severity === "CRITICAL") ? "CRITICAL" : alerts.length > 0 ? "WARNING" : "NORMAL", ts: new Date().toISOString() });
});

export default router;
