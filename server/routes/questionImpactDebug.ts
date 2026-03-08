import { Router } from "express";
import { requireRole } from "../middleware/requireRole";
import { firestoreCaseStore } from "../services/firestoreCaseStore";
import { selectNextBestQuestion } from "../services/diagnostic/nextBestQuestionEngine";

export const questionImpactDebugRouter = Router();

questionImpactDebugRouter.get("/:caseId", requireRole(["admin", "physician"]), async (req, res) => {
  try {
    const caseRecord = await firestoreCaseStore.getCase(req.params.caseId);
    if (!caseRecord) { res.status(404).json({ error: "Case not found" }); return; }

    const dxCandidates = caseRecord.engineResult?.dxCandidates ?? [];
    const answers = caseRecord.answers ?? {};
    const allQuestions = Object.keys(answers).concat(
      (caseRecord.unansweredCriticalQuestions ?? [])
    );

    const result = selectNextBestQuestion(dxCandidates, answers, allQuestions);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to compute question impact" });
  }
});
