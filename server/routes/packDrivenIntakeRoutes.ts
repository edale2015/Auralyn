import express from "express";
import {
  symptomPackRows,
  modifierPackRows,
  clinicianAlgorithmRows,
} from "../config/packRows.seed";
import {
  parseSymptomPackRow,
  parseModifierPackRow,
  parseClinicianAlgorithmRow,
} from "../engines/packRowParser";
import { matchSymptomPack } from "../engines/packMatcher";
import { evaluateSymptomPack } from "../engines/symptomPackEvaluationEngine";
import { generatePlanFromTemplate } from "../engines/planTemplateEngine";
import { findComplaintPack, getInitialQuestions, getNextComplaintQuestion, evaluateComplaintEscalation } from "../engines/complaintPackEngine";
import { complaintPacks } from "../config/complaintPacks";

const router = express.Router();

router.post("/evaluate", (req, res) => {
  const chiefComplaint = String(req.body.chiefComplaint || "");
  const answers = req.body.answers || {};

  const symptomPacks = symptomPackRows
    .filter(x => x.isActive)
    .map(parseSymptomPackRow);

  const modifierPacks = modifierPackRows
    .filter(x => x.isActive)
    .map(parseModifierPackRow);

  const clinicianAlgorithms = clinicianAlgorithmRows
    .filter(x => x.isActive)
    .map(parseClinicianAlgorithmRow);

  const pack = matchSymptomPack(chiefComplaint, symptomPacks);

  if (!pack) {
    return res.json({
      matched: false,
      disposition: "telemed_now",
      reason: "no_symptom_pack_match",
    });
  }

  const evaluation = evaluateSymptomPack(
    pack,
    modifierPacks,
    clinicianAlgorithms,
    answers
  );

  const plan = generatePlanFromTemplate(
    pack.planTemplateKey,
    evaluation.finalDisposition,
    answers
  );

  return res.json({
    matched: true,
    pack,
    evaluation,
    plan,
    nextQuestions: pack.questions.slice(0, 4),
  });
});

router.get("/packs", (_req, res) => {
  res.json({ packs: complaintPacks, total: complaintPacks.length });
});

router.post("/find-pack", (req, res) => {
  const chiefComplaint = String(req.body.chiefComplaint || "");
  const pack = findComplaintPack(chiefComplaint);
  if (!pack) {
    return res.json({ matched: false });
  }
  return res.json({ matched: true, pack });
});

router.post("/initial-questions", (req, res) => {
  const chiefComplaint = String(req.body.chiefComplaint || "");
  const maxQuestions = req.body.maxQuestions || 4;
  const questions = getInitialQuestions(chiefComplaint, maxQuestions);
  res.json({ questions });
});

router.post("/next-question", (req, res) => {
  const chiefComplaint = String(req.body.chiefComplaint || "");
  const answeredKeys = req.body.answeredKeys || [];
  const question = getNextComplaintQuestion(chiefComplaint, answeredKeys);
  res.json({ question });
});

router.post("/escalation-check", (req, res) => {
  const chiefComplaint = String(req.body.chiefComplaint || "");
  const answers = req.body.answers || {};
  const result = evaluateComplaintEscalation(chiefComplaint, answers);
  res.json(result);
});

export default router;
