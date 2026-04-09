/**
 * Hospital Brain Routes
 *
 * POST /api/hospital-brain/run
 *   Runs the full hospital brain orchestrator — demand forecast, capacity,
 *   surge detection, per-patient routing, and population signals.
 *   Returns a complete HospitalBrainOutput.
 */

import express from "express";
import { runHospitalBrain, type HospitalBrainInput } from "../hospital/hospitalBrain";
import { randomUUID } from "crypto";

const router = express.Router();

router.post("/hospital-brain/run", async (req, res) => {
  try {
    const body = req.body as Partial<HospitalBrainInput>;

    // Ensure required arrays are present; provide safe defaults for demo/testing
    const input: HospitalBrainInput = {
      traceId:           body.traceId ?? randomUUID(),
      nowTs:             body.nowTs   ?? Date.now(),
      incomingPatients:  Array.isArray(body.incomingPatients)  ? body.incomingPatients  : [],
      historicalVolumes: Array.isArray(body.historicalVolumes) ? body.historicalVolumes : [],
      operationalState: {
        telemedOpenSlots:   body.operationalState?.telemedOpenSlots   ?? 10,
        clinicOpenSlots:    body.operationalState?.clinicOpenSlots    ?? 5,
        physicianAvailable: body.operationalState?.physicianAvailable ?? 2,
        nurseAvailable:     body.operationalState?.nurseAvailable     ?? 3,
        currentQueueSize:   body.operationalState?.currentQueueSize   ?? 0,
        averageWaitMinutes: body.operationalState?.averageWaitMinutes ?? 0,
        ehrHealthy:         body.operationalState?.ehrHealthy         ?? true,
        fhirHealthy:        body.operationalState?.fhirHealthy        ?? true,
      },
    };

    const output = await runHospitalBrain(input);
    res.json(output);
  } catch (err) {
    console.error("[HospitalBrain] Error:", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

export default router;
