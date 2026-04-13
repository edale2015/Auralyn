/**
 * server/routes/fhirRoutes.ts — FHIR resource ingest endpoints
 *
 * FIXES (Code Review Issue #6):
 *   Previously both /patient and /observation accepted PHI with no authentication
 *   middleware — any caller could ingest arbitrary FHIR resources or tamper with
 *   existing data. Fixed: requirePhysician enforces physician-level JWT auth on
 *   all write endpoints. clinicId from the verified token is attached to every
 *   ingested resource to ensure tenant isolation.
 */

import { Router } from "express";
import { requirePhysician } from "../auth/requirePhysician";
import bulkExportRouter, {
  addFHIRResource,
  buildPatientResource,
  buildObservationResource,
} from "../fhir/bulkExport";

const router = Router();

// Bulk export sub-router (read-only, auth handled internally)
router.use("/", bulkExportRouter);

/**
 * POST /api/fhir/patient
 * Ingest a FHIR Patient resource.
 * Requires physician-level JWT. clinicId is injected from the token.
 */
router.post("/patient", requirePhysician, (req, res) => {
  try {
    const physician = req.physician!;
    const resource  = buildPatientResource({
      ...req.body,
      // Enforce tenant scoping via injected clinicId — never trust body for this
      clinicId: physician.clinicId,
    });
    addFHIRResource(resource);
    res.json({ ok: true, resource });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/fhir/observation
 * Ingest a FHIR Observation resource.
 * Requires physician-level JWT. clinicId is injected from the token.
 */
router.post("/observation", requirePhysician, (req, res) => {
  try {
    const physician = req.physician!;
    const resource  = buildObservationResource({
      ...req.body,
      clinicId: physician.clinicId,
    });
    addFHIRResource(resource);
    res.json({ ok: true, resource });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

export default router;
