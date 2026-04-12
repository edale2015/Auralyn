import express from "express";
import { runPilotEncounter } from "../workflows/pilotWorkflow";

const router = express.Router();

/**
 * POST /api/pilot/encounter
 * Run a full pilot encounter: clinical workflow → CPT billing → EHR submission.
 */
router.post("/encounter", async (req, res) => {
  try {
    const { patientId, complaint } = req.body;
    if (!patientId || !complaint) {
      res.status(400).json({ error: "patientId and complaint are required" });
      return;
    }
    const result = await runPilotEncounter(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Pilot encounter failed" });
  }
});

export default router;
