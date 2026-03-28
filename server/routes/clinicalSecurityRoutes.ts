/**
 * Clinical Security & Pipeline Routes
 *
 * Exposes the 6 new production-grade features for testing and integration:
 *   A. RLS context probe
 *   B. SMART on FHIR auth status
 *   C. Surescripts eRx stub
 *   D. Claim scrubber
 *   E. Multi-complaint fusion engine
 *   F/G. Immutable audit pipeline
 */

import { Router, Request, Response } from "express";
import { setClinicContext } from "../middleware/setRLS";
import { isSmartAuthConfigured } from "../ehr/fhir/fhirAuth";
import { sendEPrescription, verifyPharmacy } from "../medications/surescriptsAdapter";
import { scrubClaim } from "../billing/claimScrubber";
import { fuseComplaints } from "../clinical/multiComplaintFusion";
import { logEvent, getRecentAuditRecords, getAuditLogStats } from "../ops/auditEvents";

const router = Router();

// ── A. RLS context probe ─────────────────────────────────────────────────────
router.get("/rls/status", (_req: Request, res: Response) => {
  res.json({
    ok: true,
    description: "Row-Level Security is active on clinic_patients, clinic_encounters, and clinic_intake_sessions",
    tables: ["clinic_patients", "clinic_encounters", "clinic_intake_sessions"],
    setting: "app.clinic_id",
    migration: "server/db/migrations/001_rls.sql",
  });
});

router.post("/rls/set-context", async (req: Request, res: Response) => {
  const { clinicId } = req.body;
  if (!clinicId) return res.status(400).json({ error: "clinicId required" });
  try {
    await setClinicContext(clinicId);
    logEvent({ type: "RLS_CONTEXT_SET", clinicId, actor: "api", severity: "info" });
    return res.json({ ok: true, clinicId, message: `app.clinic_id set to '${clinicId}'` });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "RLS set failed" });
  }
});

// ── B. SMART on FHIR auth status ─────────────────────────────────────────────
router.get("/fhir-auth/status", (_req: Request, res: Response) => {
  const configured = isSmartAuthConfigured();
  res.json({
    ok: true,
    configured,
    flow: "client_credentials",
    requiredEnvVars: ["FHIR_BASE_URL", "FHIR_CLIENT_ID", "FHIR_CLIENT_SECRET"],
    optionalEnvVars: ["FHIR_AUDIENCE"],
    message: configured
      ? "SMART on FHIR client_credentials auth is configured"
      : "Set FHIR_CLIENT_ID + FHIR_CLIENT_SECRET to enable SMART on FHIR auth",
  });
});

// ── C. Surescripts eRx ──────────────────────────────────────────────────────
router.post("/erx/send", async (req: Request, res: Response) => {
  const { patientId, drug, dose, quantity, refills, pharmacyId, prescriberId } = req.body;
  if (!drug || !pharmacyId || !prescriberId) {
    return res.status(400).json({ error: "drug, pharmacyId, prescriberId are required" });
  }
  try {
    const result = await sendEPrescription({
      patientId:   patientId   || "unknown",
      drug,
      dose:        dose        || "as directed",
      quantity:    quantity    || 30,
      refills:     refills     || 0,
      pharmacyId,
      prescriberId,
    });
    logEvent({ type: "ERX_SENT", actor: prescriberId, severity: "info", payload: result });
    return res.json({ ok: true, ...result });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "eRx failed" });
  }
});

router.post("/erx/verify-pharmacy", async (req: Request, res: Response) => {
  const { ncpdpId } = req.body;
  if (!ncpdpId) return res.status(400).json({ error: "ncpdpId required" });
  const valid = await verifyPharmacy(ncpdpId);
  return res.json({ ok: true, ncpdpId, valid });
});

// ── D. Claim scrubber ────────────────────────────────────────────────────────
router.post("/billing/scrub-claim", (req: Request, res: Response) => {
  const result = scrubClaim(req.body);
  if (!result.valid) {
    logEvent({
      type:     "CLAIM_SCRUB_FAILED",
      severity: "warn",
      payload:  { issues: result.issues, warnings: result.warnings, input: req.body },
    });
  }
  return res.json({ ok: true, ...result });
});

// ── E. Multi-complaint fusion ────────────────────────────────────────────────
router.post("/clinical/fuse", (req: Request, res: Response) => {
  const { symptoms = [], age, vitals } = req.body;
  const fusion = fuseComplaints({ symptoms, age, vitals });

  if (fusion?.priority === "CRITICAL" || fusion?.priority === "HIGH") {
    logEvent({
      type:     "FUSION_ALERT",
      severity: fusion.priority === "CRITICAL" ? "critical" : "warn",
      payload:  fusion,
    });
  }

  return res.json({
    ok: true,
    fusion,
    escalate: fusion !== null && (fusion.priority === "CRITICAL" || fusion.priority === "HIGH"),
  });
});

// ── F/G. Immutable audit log ─────────────────────────────────────────────────
router.get("/audit/records", (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const records = getRecentAuditRecords(limit);
  res.json({ ok: true, count: records.length, records });
});

router.get("/audit/stats", (_req: Request, res: Response) => {
  res.json({ ok: true, ...getAuditLogStats() });
});

router.post("/audit/log", (req: Request, res: Response) => {
  const { type = "GENERIC", actor, clinicId, entityId, severity, payload } = req.body;
  logEvent({ type, actor, clinicId, entityId, severity, payload });
  res.json({ ok: true, message: "Event logged" });
});

export default router;
