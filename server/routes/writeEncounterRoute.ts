/**
 * writeEncounterRoute.ts — /api/write-encounter
 *
 * The single canonical HTTP entrypoint for all clinical EHR writes.
 * Delegates entirely to executeClinicalWrite() — no business logic here.
 *
 * Auth: requirePhysician (session-validated, clinic-scoped)
 */

import { Router, Request, Response } from "express";
import { z }                         from "zod";
import { requirePhysician }          from "../auth/requirePhysician";
import {
  executeClinicalWrite,
  type ClinicalWriteInput,
}                                    from "../ehr/clinicalWriteOrchestrator";

const router = Router();

const WriteEncounterSchema = z.object({
  patientId:       z.string().min(1),
  disposition:     z.string().min(1),
  notes:           z.string().min(1),
  physicianSigned: z.boolean(),
  confidence:      z.number().min(0).max(1),
  system:          z.enum(["athena", "epic", "ecw", "mock"]).optional(),
  encounter:       z.record(z.any()).optional(),
  patient:         z.record(z.any()).optional(),
});

router.post(
  "/write-encounter",
  requirePhysician,
  async (req: Request, res: Response) => {
    const parsed = WriteEncounterSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error:   "Invalid request body",
        issues:  parsed.error.issues,
      });
    }

    const session = (req as any).session ?? {};
    const user    = (req as any).user   ?? {};

    const clinicId    = session.clinicId ?? user.clinicId ?? "";
    const physicianId = session.userId   ?? user.id       ?? "unknown";

    if (!clinicId) {
      return res.status(403).json({
        success: false,
        error:   "No clinicId on session — cannot perform clinical write",
      });
    }

    const input: ClinicalWriteInput = {
      clinicId,
      physicianId,
      ...parsed.data,
    };

    try {
      const result = await executeClinicalWrite(input);
      return res.status(200).json(result);
    } catch (err: any) {
      // Failure already escalated inside orchestrator — propagate to UI
      return res.status(500).json({
        success:                    false,
        requiresImmediateAttention: true,
        error:                      err.message,
      });
    }
  }
);

export default router;
