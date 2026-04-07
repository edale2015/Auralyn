import { Router } from "express";
import { z } from "zod";
import { requireRole } from "../middleware/requireRole";
import { buildEncounterBundle } from "../billing/encounterBundleBuilder";

const router = Router();

const encounterSchema = z.object({
  patientId:    z.string().min(1, "patientId required"),
  patientName:  z.string().optional(),
  complaint:    z.string().min(1, "complaint required"),
  diagnosis:    z.string().min(1, "diagnosis required"),
  differentials: z.array(z.string()).optional().default([]),
  triage:       z.string().min(1, "triage required"),
  confidence:   z.number().min(0).max(1).optional(),
  answers:      z.record(z.any()).optional(),
  trace:        z.record(z.any()).optional(),
  provider:     z.string().optional(),
  facility:     z.string().optional(),
});

router.post("/build", requireRole(["admin", "physician"]), async (req, res) => {
  const parsed = encounterSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message, details: parsed.error.issues });
  }
  const bundle = await buildEncounterBundle(parsed.data);
  res.json(bundle);
});

const batchEncounterSchema = z.object({
  encounters: z.array(encounterSchema).min(1, "encounters[] must have at least one entry"),
});

router.post("/build-batch", requireRole(["admin"]), async (req, res) => {
  const parsed = batchEncounterSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message, details: parsed.error.issues });
  }
  const bundles = await Promise.all(parsed.data.encounters.map(buildEncounterBundle));
  res.json({ count: bundles.length, bundles });
});

export default router;
