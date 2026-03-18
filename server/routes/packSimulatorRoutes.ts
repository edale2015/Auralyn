import express from "express";
import { getPackRepository } from "../repos/getPackRepository";
import { parseSymptomPackRow, parseModifierPackRow, parseClinicianAlgorithmRow } from "../engines/packRowParser";
import { evaluateSymptomPack } from "../engines/symptomPackEvaluationEngine";
import { generatePlanFromTemplate } from "../engines/planTemplateEngine";

const router = express.Router();
const repo = getPackRepository();

router.post("/run", async (req, res) => {
  const { symptomPackId, answers } = req.body;

  if (!symptomPackId || !answers) {
    return res.status(400).json({ error: "symptomPackId and answers required" });
  }

  const symptomRows = await repo.getSymptomRows();
  const modifierRows = await repo.getModifierRows();
  const algorithmRows = await repo.getAlgorithmRows();

  const rawSymptom = symptomRows.find(r => r.id === symptomPackId);
  if (!rawSymptom) {
    return res.status(404).json({ error: `Symptom pack ${symptomPackId} not found` });
  }

  const parsedSymptom = parseSymptomPackRow(rawSymptom);
  const parsedModifiers = modifierRows.filter(m => m.isActive).map(parseModifierPackRow);
  const parsedAlgorithms = algorithmRows.filter(a => a.isActive).map(parseClinicianAlgorithmRow);

  const evaluation = evaluateSymptomPack(parsedSymptom, parsedModifiers, parsedAlgorithms, answers);

  const plan = generatePlanFromTemplate(rawSymptom.planTemplateKey);

  res.json({
    symptomPackId,
    answers,
    evaluation: {
      escalate: evaluation.forceEscalation,
      review: evaluation.forceReview,
      disposition: evaluation.finalDisposition,
      baseDisposition: evaluation.baseDisposition,
      redFlagsTriggered: evaluation.matchedRedFlags,
      escalateReasons: evaluation.matchedEscalateRules,
      reviewReasons: evaluation.matchedReviewRules,
      planTemplateKey: rawSymptom.planTemplateKey,
    },
    modifiers: {
      totalRiskAdjustment: evaluation.modifierRiskDelta,
      forceReview: evaluation.forceReview,
      forceEscalation: evaluation.forceEscalation,
      appliedAdjustments: evaluation.reasons.filter(r => !r.startsWith("red_flag:") && !r.startsWith("escalate_rule:") && !r.startsWith("review_rule:")),
    },
    triggeredAlgorithms: evaluation.triggeredAlgorithms,
    plan,
    summary: {
      escalate: evaluation.forceEscalation,
      review: evaluation.forceReview,
      riskDelta: evaluation.modifierRiskDelta,
      disposition: evaluation.finalDisposition,
      redFlagsTriggered: evaluation.matchedRedFlags,
      escalateReasons: [
        ...evaluation.matchedEscalateRules,
        ...evaluation.reasons.filter(r => r.includes("force_escalation")),
      ],
      reviewReasons: [
        ...evaluation.matchedReviewRules,
        ...evaluation.reasons.filter(r => r.includes("force_review")),
      ],
      algorithmCount: evaluation.triggeredAlgorithms.length,
    },
  });
});

router.get("/available-packs", async (_req, res) => {
  const symptomRows = await repo.getSymptomRows();
  const activePacks = symptomRows
    .filter(r => r.isActive)
    .map(r => ({
      id: r.id,
      title: r.title,
      system: r.system,
      likelyDisposition: r.likelyDisposition,
    }));

  res.json({ packs: activePacks });
});

router.post("/questions", async (req, res) => {
  const { symptomPackId } = req.body;

  if (!symptomPackId) {
    return res.status(400).json({ error: "symptomPackId required" });
  }

  const symptomRows = await repo.getSymptomRows();
  const rawSymptom = symptomRows.find(r => r.id === symptomPackId);

  if (!rawSymptom) {
    return res.status(404).json({ error: `Symptom pack ${symptomPackId} not found` });
  }

  const parsed = parseSymptomPackRow(rawSymptom);

  res.json({
    symptomPackId,
    title: parsed.title,
    system: parsed.system,
    questions: parsed.questions,
    redFlags: parsed.redFlags,
  });
});

export default router;
