/**
 * server/ehr/fhir/fhirRoutes.ts — FHIR R4 sync and patient search routes
 *
 * FIX (Code Review Critical Finding #6):
 *   /sync-encounter and /patient/search previously had NO authentication — any
 *   unauthenticated internet client could inject arbitrary patient/encounter data
 *   into the FHIR server, or search for real patients by identifier. Direct HIPAA
 *   violation surface and data integrity risk.
 *
 *   Fixed:
 *   1. requirePhysician applied to the entire router — all FHIR sync endpoints
 *      now require physician-level JWT.
 *   2. clinicId is validated against the authenticated session's clinicId — the
 *      body's clinicId is IGNORED; only the token's clinicId is used.
 *   3. Patient search is physician-gated with tenant context.
 *   4. /status remains public (no PHI, config info only).
 */

import { Router } from "express";
import { requirePhysician } from "../../auth/requirePhysician";
import { syncEncounterToFhir, searchExternalPatientByIdentifier } from "./fhirService";
import { isFhirConfigured } from "./fhirClient";

export const fhirRoutes = Router();

// ── Public endpoint (no PHI, no tenant data) ─────────────────────────────────

fhirRoutes.get("/status", (_req, res) => {
  res.json({
    ok: true,
    configured: isFhirConfigured(),
    baseUrl: process.env.FHIR_BASE_URL || null,
    message: isFhirConfigured()
      ? "FHIR R4 endpoint configured"
      : "FHIR not configured — set FHIR_BASE_URL to enable sync",
  });
});

// ── All remaining FHIR routes require physician auth ──────────────────────────
// FIX: requirePhysician enforces JWT, role check, and populates req.physician

fhirRoutes.use(requirePhysician);

/**
 * GET /api/fhir/patient/search
 * Search external FHIR server for a patient by identifier.
 * Requires physician-level auth. Results are scoped to the authenticated clinic.
 */
fhirRoutes.get("/patient/search", async (req, res) => {
  try {
    const identifier = String(req.query.identifier || "");
    if (!identifier) return res.status(400).json({ error: "identifier is required" });

    const physician = req.physician!;
    const data = await searchExternalPatientByIdentifier(identifier, physician.clinicId);
    return res.json({ ...data, _clinicId: physician.clinicId });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "FHIR search failed" });
  }
});

/**
 * POST /api/fhir/sync-encounter
 * Sync a local encounter to the configured FHIR R4 server.
 * Requires physician-level auth. clinicId from JWT — never from request body.
 */
fhirRoutes.post("/sync-encounter", async (req, res) => {
  try {
    const { encounter, patient } = req.body;
    if (!encounter || !patient) {
      return res.status(400).json({ error: "encounter and patient are required" });
    }

    // FIX: clinicId is taken from the verified token — body value is IGNORED
    const physician = req.physician!;
    const clinicId  = physician.clinicId ?? "unknown";

    const result = await syncEncounterToFhir({ clinicId, encounter, patient });
    return res.json({ ...result, _auditedBy: physician.id, _clinicId: clinicId });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "FHIR sync failed" });
  }
});
