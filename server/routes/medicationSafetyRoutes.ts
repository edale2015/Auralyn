/**
 * Medication Safety API
 * Drug interaction detection, formulary checks, and DEA schedule guard.
 * Addresses architectural concern: medication safeguards not exposed.
 */

import { Router, type Request, type Response } from "express";
import { detectInteractions } from "../medications/interactions";
import { checkFormulary }     from "../medications/formulary";
import { validatePrescriptionAuthority, getControlledSchedule } from "../medications/deaGuard";
import { runMedicationSafetyCheck } from "../medications/medSafetyService";
import { publish }            from "../events/bus";
import { Topics }             from "../events/topics";

const router = Router();

/**
 * POST /api/medications/safety-check
 * Full medication safety evaluation: interactions + formulary + DEA guard.
 */
router.post("/safety-check", async (req: Request, res: Response) => {
  try {
    const {
      clinicId     = "default",
      payerId      = "medicare",
      currentMeds  = [],
      proposedDrug,
      clinicianHasDea = false,
      state        = "NY",
    } = req.body;

    if (!proposedDrug) {
      return res.status(400).json({ error: "proposedDrug is required" });
    }

    const result = await runMedicationSafetyCheck({
      clinicId, payerId, currentMeds, proposedDrug, clinicianHasDea, state,
    });

    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? "Medication safety check failed" });
  }
});

/**
 * POST /api/medications/interactions
 * Check for drug–drug interactions in a medication list.
 */
router.post("/interactions", (req: Request, res: Response) => {
  const { medications = [] } = req.body;
  if (!Array.isArray(medications) || medications.length < 2) {
    return res.status(400).json({ error: "Provide at least 2 medications to check interactions" });
  }
  const interactions = detectInteractions(medications);
  return res.json({
    medications,
    interactionsFound: interactions.length,
    interactions,
    highestSeverity: interactions.reduce<string | null>((acc, i) => {
      const order = { contraindicated: 4, high: 3, moderate: 2, low: 1 };
      if (!acc) return i.severity;
      return (order[i.severity] ?? 0) > (order[acc as keyof typeof order] ?? 0) ? i.severity : acc;
    }, null),
  });
});

/**
 * GET /api/medications/formulary
 * Check formulary coverage for a drug.
 */
router.get("/formulary", async (req: Request, res: Response) => {
  const { drug, clinicId = "default", payerId = "medicare" } = req.query as Record<string, string>;
  if (!drug) return res.status(400).json({ error: "drug query parameter is required" });

  const result = await checkFormulary(clinicId, payerId, drug);
  return res.json(result);
});

/**
 * GET /api/medications/dea-schedule
 * Return DEA schedule class for a drug.
 */
router.get("/dea-schedule", (req: Request, res: Response) => {
  const { drug } = req.query as Record<string, string>;
  if (!drug) return res.status(400).json({ error: "drug query parameter is required" });

  const schedule = getControlledSchedule(drug);
  return res.json({
    drug,
    controlled: schedule !== null,
    schedule,
    note: schedule
      ? `Schedule ${schedule} controlled substance — DEA registration required`
      : "Not a scheduled controlled substance",
  });
});

/**
 * POST /api/medications/async-safety-check
 * Queue a medication safety job asynchronously via event bus.
 */
router.post("/async-safety-check", async (req: Request, res: Response) => {
  const { clinicId = "default", proposedDrug, currentMeds = [], payerId = "medicare" } = req.body;
  if (!proposedDrug) return res.status(400).json({ error: "proposedDrug is required" });

  const eventId = await publish(Topics.MedicationSafetyRequested, {
    clinicId, proposedDrug, currentMeds, payerId,
    requestedAt: new Date().toISOString(),
  });

  return res.json({ queued: true, eventId, drug: proposedDrug });
});

export default router;
