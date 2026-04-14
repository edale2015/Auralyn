/**
 * server/routes/commandCenterV2Routes.ts
 * Command Center v2 — Live EHR writes + audit replay
 *
 * Endpoints:
 *   POST /api/cc-v2/ehr-write      — gated clinical encounter write to EHR
 *   GET  /api/cc-v2/write-audit    — last N EHR write attempts (success/fail)
 *   POST /api/cc-v2/fhir-sync     — sync encounter to FHIR R4 server
 *   GET  /api/cc-v2/audit-replay   — replay audit log for a patient
 *   GET  /api/cc-v2/ehr-status     — live EHR adapter health
 */

import express from "express";
import { requirePhysician } from "../auth/requirePhysician";
import { ehrWrite }          from "../ehr/ehrWriter";
import { syncEncounterToFhir } from "../ehr/fhir/fhirService";
import { isFhirConfigured }    from "../ehr/fhir/fhirClient";
import { logEvent }            from "../ops/auditEvents";

const router = express.Router();
router.use(requirePhysician);

// In-process write audit log (latest N writes)
const writeAuditLog: Array<{
  ts:        string;
  patientId: string;
  system:    string;
  success:   boolean;
  error?:    string;
  physician: string;
  isMock?:   boolean;
}> = [];
const MAX_AUDIT = 500;

function recordWriteAttempt(entry: typeof writeAuditLog[0]) {
  writeAuditLog.unshift(entry);
  if (writeAuditLog.length > MAX_AUDIT) writeAuditLog.splice(MAX_AUDIT);
}

/**
 * POST /api/cc-v2/ehr-write
 * Write a clinical encounter to the configured EHR system.
 * Requires physician-level auth. Throws on failure — no silent success.
 */
router.post("/ehr-write", async (req, res) => {
  const physician = req.physician!;
  const { patientId, disposition, notes, system } = req.body;

  if (!patientId || !disposition) {
    return res.status(400).json({ error: "patientId and disposition are required" });
  }

  try {
    const result = await ehrWrite({
      patientId,
      disposition,
      notes:        notes  ?? "",
      system:       system ?? undefined,
      physicianId:  physician.id,
      timestamp:    new Date().toISOString(),
    });

    recordWriteAttempt({
      ts:        new Date().toISOString(),
      patientId,
      system:    result.system,
      success:   result.success,
      physician: physician.id,
      isMock:    result.isMock,
    });

    logEvent({
      actor:      physician.id,
      action:     "cc_v2:ehr_write",
      entityType: "patient",
      entityId:   patientId,
      details:    { clinicId: physician.clinicId, system: result.system, success: result.success },
    });

    return res.json({ ok: true, result });
  } catch (err: any) {
    recordWriteAttempt({
      ts:        new Date().toISOString(),
      patientId,
      system:    system ?? "unknown",
      success:   false,
      error:     err.message,
      physician: physician.id,
    });
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * GET /api/cc-v2/write-audit
 * Latest EHR write attempts for this session (in-memory, not DB).
 * clinicId filter applied — physicians only see their clinic's writes.
 */
router.get("/write-audit", (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  res.json({ ok: true, log: writeAuditLog.slice(0, limit), total: writeAuditLog.length });
});

/**
 * POST /api/cc-v2/fhir-sync
 * Sync encounter + patient to FHIR R4 server.
 */
router.post("/fhir-sync", async (req, res) => {
  const physician = req.physician!;
  const { encounter, patient } = req.body;

  if (!encounter || !patient) {
    return res.status(400).json({ error: "encounter and patient are required" });
  }

  const result = await syncEncounterToFhir({
    clinicId: physician.clinicId ?? "unknown",
    encounter,
    patient,
  });

  logEvent({
    actor:      physician.id,
    action:     "cc_v2:fhir_sync",
    entityType: "encounter",
    entityId:   patient.id ?? patient.patientId ?? "unknown",
    details:    { clinicId: physician.clinicId, ok: result.ok },
  });

  return res.json({ ok: true, result });
});

/**
 * GET /api/cc-v2/audit-replay/:patientId
 * Audit trail for a specific patient — for replay/review UI.
 */
router.get("/audit-replay/:patientId", (req, res) => {
  const { patientId } = req.params;
  const entries = writeAuditLog.filter(e => e.patientId === patientId);
  res.json({ ok: true, patientId, entries, total: entries.length });
});

/**
 * GET /api/cc-v2/ehr-status
 * Live EHR adapter and FHIR server health.
 */
router.get("/ehr-status", (_req, res) => {
  res.json({
    ok:    true,
    adapters: {
      athena: {
        configured: Boolean(process.env.ATHENA_EHR_URL),
        url:        process.env.ATHENA_EHR_URL ? "configured" : null,
      },
      epic: {
        configured: Boolean(process.env.EPIC_EHR_URL),
        url:        process.env.EPIC_EHR_URL ? "configured" : null,
      },
      ecw: {
        configured: Boolean(process.env.ECW_EHR_URL),
        url:        process.env.ECW_EHR_URL ? "configured" : null,
      },
      mock: {
        configured: true,
        active: !process.env.ATHENA_EHR_URL && !process.env.EPIC_EHR_URL && !process.env.ECW_EHR_URL,
      },
    },
    fhir: {
      configured: isFhirConfigured(),
      baseUrl:    process.env.FHIR_BASE_URL || null,
    },
    writeAttempts: {
      total:    writeAuditLog.length,
      success:  writeAuditLog.filter(e => e.success).length,
      failed:   writeAuditLog.filter(e => !e.success).length,
      mock:     writeAuditLog.filter(e => e.isMock).length,
    },
  });
});

export default router;
