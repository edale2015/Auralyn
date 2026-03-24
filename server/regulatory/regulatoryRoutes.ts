import { Router } from "express";
import {
  registerLicense, checkCompliance, getLicenses, getPhysicianLicense,
  suggestLicensingExpansion, getTelehealthCompactStates, getCoverageMap,
} from "./licenseRegistry";

const router = Router();

router.post("/license", (req, res) => {
  const { physicianId, states } = req.body;
  if (!physicianId || !Array.isArray(states)) {
    return res.status(400).json({ ok: false, error: "physicianId and states[] required" });
  }
  const license = registerLicense(req.body);
  res.json({ ok: true, license });
});

router.get("/license", (_req, res) => {
  res.json({ ok: true, licenses: getLicenses() });
});

router.get("/license/:physicianId", (req, res) => {
  const lic = getPhysicianLicense(req.params.physicianId);
  if (!lic) return res.status(404).json({ ok: false, error: "License not found" });
  res.json({ ok: true, license: lic });
});

router.post("/check", (req, res) => {
  const { physicianId, state, complaint } = req.body;
  if (!physicianId || !state) {
    return res.status(400).json({ ok: false, error: "physicianId and state required" });
  }
  const result = checkCompliance({ physicianId, state, complaint });
  res.json({ ok: true, compliance: result });
});

router.post("/expansion", (req, res) => {
  const { demandData } = req.body;
  if (!Array.isArray(demandData)) {
    return res.status(400).json({ ok: false, error: "demandData[] required — [{state, unservedCases}]" });
  }
  const suggestions = suggestLicensingExpansion(demandData);
  res.json({ ok: true, suggestions });
});

router.get("/coverage", (_req, res) => {
  res.json({ ok: true, coverageMap: getCoverageMap() });
});

router.get("/telehealth-compact", (_req, res) => {
  const states = getTelehealthCompactStates();
  res.json({ ok: true, states, count: states.length });
});

export default router;
