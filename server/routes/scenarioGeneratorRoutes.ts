import express from "express";
import { generateClinicalScenario, generateScenarioBatch, getAvailableComplaints } from "../simulation/clinicalScenarioGenerator";
import { getSystemArchitecture } from "../architecture/systemArchitectureMap";
import { resolveComplaint, getAliasMap, getCanonicalComplaints, addAlias } from "../agents/complaintAliasRegistry";
import { requireRole } from "../middleware/requireRole";

const router = express.Router();

router.get("/scenario/complaints", (_req, res) => {
  res.json(getAvailableComplaints());
});

router.get("/scenario/:complaint", (req, res) => {
  const scenario = generateClinicalScenario(req.params.complaint);
  if (!scenario) return res.status(404).json({ error: "No templates for this complaint" });
  res.json(scenario);
});

router.get("/scenario/:complaint/batch", (req, res) => {
  const count = parseInt(String(req.query.count || "5"));
  const scenarios = generateScenarioBatch(req.params.complaint, count);
  res.json({ complaint: req.params.complaint, count: scenarios.length, scenarios });
});

router.get("/system-architecture", (_req, res) => {
  res.json(getSystemArchitecture());
});

router.get("/complaint-aliases", (_req, res) => {
  res.json({ aliases: getAliasMap(), canonicalCount: getCanonicalComplaints().length });
});

router.get("/complaint-aliases/resolve", (req, res) => {
  const input = req.query.q as string;
  if (!input) return res.status(400).json({ error: "q parameter required" });
  const resolved = resolveComplaint(input);
  res.json({ input, resolved, matched: resolved !== input });
});

router.post("/complaint-aliases", requireRole(["admin"]), (req, res) => {
  const { alias, canonical } = req.body;
  if (!alias || !canonical) return res.status(400).json({ error: "alias and canonical required" });
  const ok = addAlias(alias, canonical);
  if (!ok) return res.status(400).json({ error: `canonical complaint '${canonical}' not found` });
  res.json({ ok: true, alias, canonical });
});

export default router;
