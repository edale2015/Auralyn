import { Router } from "express";
import { syncEncounterToFhir, searchExternalPatientByIdentifier } from "./fhirService";
import { isFhirConfigured } from "./fhirClient";

export const fhirRoutes = Router();

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

fhirRoutes.get("/patient/search", async (req, res) => {
  try {
    const identifier = String(req.query.identifier || "");
    if (!identifier) return res.status(400).json({ error: "identifier is required" });
    const data = await searchExternalPatientByIdentifier(identifier);
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "FHIR search failed" });
  }
});

fhirRoutes.post("/sync-encounter", async (req, res) => {
  try {
    const { clinicId, encounter, patient } = req.body;
    if (!encounter || !patient) {
      return res.status(400).json({ error: "encounter and patient are required" });
    }
    const result = await syncEncounterToFhir({ clinicId: clinicId || "unknown", encounter, patient });
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "FHIR sync failed" });
  }
});
