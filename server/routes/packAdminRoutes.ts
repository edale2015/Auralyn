import express from "express";
import { getPackRepository } from "../repos/getPackRepository";
import { validateAnyPackRow } from "../engines/packValidationEngine";
import { planTemplates } from "../config/planTemplates";

const router = express.Router();
const repo = getPackRepository();

router.get("/all", async (_req, res) => {
  const [symptomPackRows, modifierPackRows, clinicianAlgorithmRows] =
    await Promise.all([
      repo.getSymptomRows(),
      repo.getModifierRows(),
      repo.getAlgorithmRows(),
    ]);

  res.json({ symptomPackRows, modifierPackRows, clinicianAlgorithmRows });
});

router.get("/systems", async (_req, res) => {
  const [symptoms, modifiers, algorithms] = await Promise.all([
    repo.getSymptomRows(),
    repo.getModifierRows(),
    repo.getAlgorithmRows(),
  ]);

  const systems = Array.from(
    new Set([
      ...symptoms.map(x => x.system),
      ...modifiers.map(x => x.system),
      ...algorithms.map(x => x.system),
    ])
  ).sort();

  res.json({ systems });
});

router.post("/validate", async (req, res) => {
  const planKeys = planTemplates.map(x => x.key);
  const result = validateAnyPackRow(req.body, planKeys);
  res.json(result);
});

router.post("/symptom", async (req, res) => {
  if (req.body.tier && req.body.tier !== "symptom") {
    return res.status(400).json({ ok: false, validation: { ok: false, issues: [{ severity: "error", field: "tier", message: "Tier must be 'symptom' for this endpoint" }] } });
  }
  req.body.tier = "symptom";
  const planKeys = planTemplates.map(x => x.key);
  const validation = validateAnyPackRow(req.body, planKeys);
  if (!validation.ok) {
    return res.status(400).json({ ok: false, validation });
  }

  await repo.saveSymptomRow(req.body);
  res.json({ ok: true, row: req.body, validation });
});

router.post("/modifier", async (req, res) => {
  if (req.body.tier && req.body.tier !== "modifier") {
    return res.status(400).json({ ok: false, validation: { ok: false, issues: [{ severity: "error", field: "tier", message: "Tier must be 'modifier' for this endpoint" }] } });
  }
  req.body.tier = "modifier";
  const validation = validateAnyPackRow(req.body);
  if (!validation.ok) {
    return res.status(400).json({ ok: false, validation });
  }

  await repo.saveModifierRow(req.body);
  res.json({ ok: true, row: req.body, validation });
});

router.post("/algorithm", async (req, res) => {
  if (req.body.tier && req.body.tier !== "clinician_algorithm") {
    return res.status(400).json({ ok: false, validation: { ok: false, issues: [{ severity: "error", field: "tier", message: "Tier must be 'clinician_algorithm' for this endpoint" }] } });
  }
  req.body.tier = "clinician_algorithm";
  const validation = validateAnyPackRow(req.body);
  if (!validation.ok) {
    return res.status(400).json({ ok: false, validation });
  }

  await repo.saveAlgorithmRow(req.body);
  res.json({ ok: true, row: req.body, validation });
});

export default router;
