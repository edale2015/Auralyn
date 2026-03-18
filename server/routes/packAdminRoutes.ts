import express from "express";
import { getPackRepository } from "../repos/getPackRepository";
import { validateAnyPackRow, validatePackQuestionRow } from "../engines/packValidationEngine";
import { appendPackAuditLog } from "../engines/packAuditLogger";
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

router.get("/questions", async (_req, res) => {
  const rows = await repo.getQuestionRows();
  res.json({ rows });
});

router.get("/audit", async (req, res) => {
  const limit = Number(req.query.limit || 200);
  const rows = await repo.getAuditRows(limit);
  res.json({ rows });
});

router.post("/question", async (req, res) => {
  const validation = validatePackQuestionRow(req.body);
  if (!validation.ok) {
    await appendPackAuditLog({
      entityType: "pack_question",
      entityId: req.body.id || "unknown",
      action: "validate",
      actorId: "system",
      validationOk: false,
      validationIssuesJson: JSON.stringify(validation.issues),
      notes: "Question validation failed",
    });

    return res.status(400).json({ ok: false, validation });
  }

  await repo.saveQuestionRow(req.body);

  await appendPackAuditLog({
    entityType: "pack_question",
    entityId: req.body.id,
    action: "update",
    actorId: "system",
    afterJson: JSON.stringify(req.body),
    validationOk: true,
    validationIssuesJson: JSON.stringify(validation.issues),
    notes: "Question saved",
  });

  res.json({ ok: true, row: req.body, validation });
});

router.post("/symptom", async (req, res) => {
  if (req.body.tier && req.body.tier !== "symptom") {
    return res.status(400).json({ ok: false, validation: { ok: false, issues: [{ severity: "error", field: "tier", message: "Tier must be 'symptom' for this endpoint" }] } });
  }
  req.body.tier = "symptom";
  const planKeys = planTemplates.map(x => x.key);
  const validation = validateAnyPackRow(req.body, planKeys);

  if (!validation.ok) {
    await appendPackAuditLog({
      entityType: "symptom_pack",
      entityId: req.body.id || "unknown",
      action: "validate",
      actorId: "system",
      validationOk: false,
      validationIssuesJson: JSON.stringify(validation.issues),
      notes: "Symptom pack validation failed",
    });
    return res.status(400).json({ ok: false, validation });
  }

  await repo.saveSymptomRow(req.body);

  await appendPackAuditLog({
    entityType: "symptom_pack",
    entityId: req.body.id,
    action: "update",
    actorId: "system",
    afterJson: JSON.stringify(req.body),
    validationOk: true,
    validationIssuesJson: JSON.stringify(validation.issues),
    notes: "Symptom pack saved",
  });

  res.json({ ok: true, row: req.body, validation });
});

router.post("/modifier", async (req, res) => {
  if (req.body.tier && req.body.tier !== "modifier") {
    return res.status(400).json({ ok: false, validation: { ok: false, issues: [{ severity: "error", field: "tier", message: "Tier must be 'modifier' for this endpoint" }] } });
  }
  req.body.tier = "modifier";
  const validation = validateAnyPackRow(req.body);

  if (!validation.ok) {
    await appendPackAuditLog({
      entityType: "modifier_pack",
      entityId: req.body.id || "unknown",
      action: "validate",
      actorId: "system",
      validationOk: false,
      validationIssuesJson: JSON.stringify(validation.issues),
      notes: "Modifier pack validation failed",
    });
    return res.status(400).json({ ok: false, validation });
  }

  await repo.saveModifierRow(req.body);

  await appendPackAuditLog({
    entityType: "modifier_pack",
    entityId: req.body.id,
    action: "update",
    actorId: "system",
    afterJson: JSON.stringify(req.body),
    validationOk: true,
    validationIssuesJson: JSON.stringify(validation.issues),
    notes: "Modifier pack saved",
  });

  res.json({ ok: true, row: req.body, validation });
});

router.post("/algorithm", async (req, res) => {
  if (req.body.tier && req.body.tier !== "clinician_algorithm") {
    return res.status(400).json({ ok: false, validation: { ok: false, issues: [{ severity: "error", field: "tier", message: "Tier must be 'clinician_algorithm' for this endpoint" }] } });
  }
  req.body.tier = "clinician_algorithm";
  const validation = validateAnyPackRow(req.body);

  if (!validation.ok) {
    await appendPackAuditLog({
      entityType: "clinician_algorithm",
      entityId: req.body.id || "unknown",
      action: "validate",
      actorId: "system",
      validationOk: false,
      validationIssuesJson: JSON.stringify(validation.issues),
      notes: "Algorithm validation failed",
    });
    return res.status(400).json({ ok: false, validation });
  }

  await repo.saveAlgorithmRow(req.body);

  await appendPackAuditLog({
    entityType: "clinician_algorithm",
    entityId: req.body.id,
    action: "update",
    actorId: "system",
    afterJson: JSON.stringify(req.body),
    validationOk: true,
    validationIssuesJson: JSON.stringify(validation.issues),
    notes: "Algorithm saved",
  });

  res.json({ ok: true, row: req.body, validation });
});

export default router;
