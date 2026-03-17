import { Router, Request, Response } from "express";
import { requireRole } from "../middleware/requireRole";
import { fhirService } from "../integration/fhirService";
import { rbacService } from "../auth/rbacService";
import { orchestrationLayer } from "../layers/orchestration/orchestrationLayer";

const router = Router();

router.get("/api/ehr/status", requireRole(["admin", "physician", "nurse"]), (_req: Request, res: Response) => {
  res.json(fhirService.getConnectionStatus());
});

router.get("/api/ehr/summary", requireRole(["admin", "physician"]), (_req: Request, res: Response) => {
  res.json(fhirService.getSummary());
});

router.get("/api/ehr/patients", requireRole(["admin", "physician", "nurse"]), (_req: Request, res: Response) => {
  res.json({ patients: fhirService.getPatients() });
});

router.get("/api/ehr/patients/:id", requireRole(["admin", "physician", "nurse"]), (req: Request, res: Response) => {
  const patient = fhirService.getPatient(req.params.id);
  if (!patient) return res.status(404).json({ error: "Patient not found" });
  const encounters = fhirService.getEncounters(req.params.id);
  const observations = fhirService.getObservations(req.params.id);
  res.json({ patient, encounters, observations });
});

router.post("/api/ehr/patients", requireRole(["admin", "physician", "nurse"]), (req: Request, res: Response) => {
  const patient = fhirService.createPatient(req.body);
  res.json(patient);
});

router.get("/api/ehr/encounters", requireRole(["admin", "physician", "nurse"]), (req: Request, res: Response) => {
  const patientId = req.query.patientId as string | undefined;
  res.json({ encounters: fhirService.getEncounters(patientId) });
});

router.post("/api/ehr/encounters/from-brain", requireRole(["admin", "physician"]), (req: Request, res: Response) => {
  const { patientId, symptoms } = req.body;
  if (!patientId || !symptoms) return res.status(400).json({ error: "patientId and symptoms required" });
  const brainResult = orchestrationLayer.run(symptoms, "ehr");
  const encounter = fhirService.createEncounterFromBrain(patientId, brainResult);
  res.json({ encounter, brainResult });
});

router.get("/api/ehr/observations", requireRole(["admin", "physician", "nurse"]), (req: Request, res: Response) => {
  const patientId = req.query.patientId as string | undefined;
  res.json({ observations: fhirService.getObservations(patientId) });
});

router.post("/api/ehr/observations", requireRole(["admin", "physician", "nurse"]), (req: Request, res: Response) => {
  const obs = fhirService.createObservation(req.body);
  res.json(obs);
});

router.get("/api/rbac/roles", requireRole(["admin"]), (_req: Request, res: Response) => {
  res.json({ roles: rbacService.getAllRoles() });
});

router.get("/api/rbac/check", requireRole(["admin", "physician", "nurse", "staff", "viewer"]), (req: Request, res: Response) => {
  const role = req.query.role as any;
  const action = req.query.action as any;
  if (!role || !action) return res.status(400).json({ error: "role and action required" });
  res.json({ allowed: rbacService.can(role, action), role, action });
});

export default router;
