import { Router } from "express";
import { requireRole } from "../middleware/requireRole";
import { recordConsent, revokeConsent, getPatientConsents, listAllConsents } from "../services/patientConsentService";

export const patientConsentRouter = Router();

patientConsentRouter.get("/", requireRole(["admin"]), async (_req, res) => {
  res.json({ consents: listAllConsents() });
});

patientConsentRouter.get("/:patientId", requireRole(["admin", "physician"]), async (req, res) => {
  res.json({ consents: getPatientConsents(req.params.patientId) });
});

patientConsentRouter.post("/", requireRole(["admin", "physician", "staff"]), async (req, res) => {
  try {
    const result = recordConsent(req.body);
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err?.message ?? "Failed" }); }
});

patientConsentRouter.post("/:consentId/revoke", requireRole(["admin"]), async (req, res) => {
  const result = revokeConsent(req.params.consentId);
  if (!result) { res.status(404).json({ error: "Consent not found" }); return; }
  res.json(result);
});
