/**
 * clinicalWriteOrchestrator.ts — THE HEART
 *
 * Single canonical path for all clinical EHR writes.
 * Combines: scope gate → EHR write → FHIR sync → audit → escalation.
 *
 * RULE: Nothing else may call ehrWrite() directly in production logic.
 *       All writes flow through executeClinicalWrite().
 */

import { ehrWrite }            from "./ehrWriter";
import { syncEncounterToFhir } from "./fhir/fhirService";
import { executeWithScope }    from "../execution/executeWithScope";
import { logEvent }            from "../ops/auditEvents";
import { handleWriteFailure }  from "./failureEscalation";

export interface ClinicalWriteInput {
  clinicId:    string;
  patientId:   string;
  physicianId: string;

  disposition: string;
  notes:       string;

  encounter?: Record<string, any>;
  patient?:   Record<string, any>;

  system?: "athena" | "epic" | "ecw" | "mock";

  physicianSigned: boolean;
  confidence:      number;
}

export interface ClinicalWriteOutput {
  success: boolean;
  ehr:     { success: boolean; system: string; recordedAt: string; error?: string };
  fhir:    { ok: boolean; skipped?: boolean; error?: string } | null;
  durationMs: number;
}

export async function executeClinicalWrite(
  input: ClinicalWriteInput
): Promise<ClinicalWriteOutput> {
  const scopedResult = await executeWithScope(
    {
      agentRole: "clinical_writer",
      action:    "write:clinical",
      context: {
        physicianSigned: input.physicianSigned,
        confidence:      input.confidence,
        clinicId:        input.clinicId,
      },
    },
    async () => {
      const startedAt = Date.now();

      // ── STEP 1: EHR WRITE (primary source of truth) ──────────────────────
      let ehrResult: Awaited<ReturnType<typeof ehrWrite>>;
      try {
        ehrResult = await ehrWrite({
          patientId:   input.patientId,
          disposition: input.disposition,
          notes:       input.notes,
          physicianId: input.physicianId,
          system:      input.system,
        });
      } catch (err: any) {
        // EHR write failure — escalate immediately, re-throw so scope sees failure
        await handleWriteFailure(err, {
          clinicId:   input.clinicId,
          patientId:  input.patientId,
          physicianId: input.physicianId,
          step:        "ehr_write",
        });
        throw err;
      }

      // ── STEP 2: FHIR SYNC (secondary / interop layer) ────────────────────
      let fhirResult: Awaited<ReturnType<typeof syncEncounterToFhir>> | null = null;

      if (input.encounter && input.patient) {
        try {
          fhirResult = await syncEncounterToFhir({
            clinicId:  input.clinicId,
            encounter: input.encounter,
            patient:   input.patient,
          });
        } catch (err: any) {
          // FHIR failure does NOT roll back the EHR write — log and continue
          fhirResult = { ok: false, error: err.message };
        }
      }

      const durationMs = Date.now() - startedAt;

      // ── STEP 3: AUDIT LOG ─────────────────────────────────────────────────
      logEvent({
        actor:      input.physicianId,
        action:     "clinical.write.completed",
        entityType: "patient",
        entityId:   input.patientId,
        details: {
          clinicId:    input.clinicId,
          ehrSystem:   ehrResult.system,
          ehrSuccess:  ehrResult.success,
          fhirSuccess: fhirResult?.ok ?? null,
          fhirSkipped: fhirResult?.skipped ?? null,
          durationMs,
        },
      });

      return {
        success:    true,
        ehr:        ehrResult,
        fhir:       fhirResult,
        durationMs,
      };
    }
  );

  if (scopedResult.status === "BLOCKED") {
    throw new Error(`Clinical write blocked by scope gate: ${scopedResult.guard.reason}`);
  }

  if (scopedResult.status === "PENDING_OVERRIDE") {
    throw new Error(`Clinical write requires physician override: ${scopedResult.guard.reason}`);
  }

  return scopedResult.result as ClinicalWriteOutput;
}
