import { Router, Request, Response } from "express";
import { runMedicationSafetyCheck } from "./medSafetyService";
import { getInteractionDb } from "./interactions";
import { listFormularyOverrides } from "./formulary";
import { getScheduleDb } from "./deaGuard";
import { publishMedicationSafetyRequested } from "../events/publisher";

const router = Router();

router.post("/safety-check", async (req: Request, res: Response) => {
  try {
    const {
      clinicId = "default",
      payerId = "default",
      currentMeds = [],
      proposedDrug,
      clinicianHasDea = false,
      state = "NY",
      patientAge,
    } = req.body;

    if (!proposedDrug) {
      return res.status(400).json({ error: "proposedDrug is required" });
    }

    const result = await runMedicationSafetyCheck({
      clinicId,
      payerId,
      currentMeds,
      proposedDrug,
      clinicianHasDea,
      state,
      patientAge,
    });

    return res.json({ ok: true, ...result });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Safety check failed" });
  }
});

router.post("/queue-safety-check", async (req: Request, res: Response) => {
  try {
    const { clinicId = "default", proposedDrug, currentMeds = [] } = req.body;
    if (!proposedDrug) return res.status(400).json({ error: "proposedDrug is required" });
    const eventId = await publishMedicationSafetyRequested({ clinicId, proposedDrug, currentMeds });
    return res.json({ ok: true, queued: true, eventId });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Queue failed" });
  }
});

router.get("/interactions", (_req: Request, res: Response) => {
  res.json({ ok: true, interactions: getInteractionDb() });
});

router.get("/formulary", (_req: Request, res: Response) => {
  res.json({ ok: true, overrides: listFormularyOverrides() });
});

router.get("/dea-schedules", (_req: Request, res: Response) => {
  res.json({ ok: true, schedules: getScheduleDb() });
});

export default router;
