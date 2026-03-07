import { Router } from "express";
import { requireRole } from "../middleware/requireRole";
import { firestoreCaseStore } from "../services/firestoreCaseStore";
import { detectCriticalQuestions } from "../services/chatCriticalQuestionDetector";
import { rankNextQuestions } from "../services/chatQuestionPriorityRanker";
import { resolveChatQuestionText } from "../services/chatQuestionTextResolver";
import { loadComplaintConfig } from "../services/complaintConfigLoader";
import { buildFollowupBundle } from "../services/chatFollowupBundleBuilder";

export const chatFollowupBundleRouter = Router();

chatFollowupBundleRouter.get(
  "/:caseId",
  requireRole(["admin", "physician", "staff"]),
  async (req, res) => {
    try {
      const caseRecord = await firestoreCaseStore.getCase(req.params.caseId);
      if (!caseRecord) {
        res.status(404).json({ error: "Case not found" });
        return;
      }

      const cfg = await loadComplaintConfig(caseRecord.complaintId);
      const critical = detectCriticalQuestions({
        complaintId: caseRecord.complaintId,
        answers: caseRecord.answers ?? {},
        triggeredRedFlags: caseRecord.engineResult?.triggeredRedFlags ?? [],
        recommendedDisposition: caseRecord.engineResult?.recommendedDisposition,
      });

      const questions = cfg?.coreQuestions ?? [];
      const candidates = questions.map((q: any) => ({
        token: q.qId ?? q.Q_ID ?? "",
        questionText: resolveChatQuestionText({
          token: q.qId ?? q.Q_ID ?? "",
          fallbackQuestionText: q.questionText ?? q.QUESTION_TEXT,
          complaintId: caseRecord.complaintId,
        }),
        askOrder: Number(q.askOrder ?? q.ASK_ORDER ?? 0),
      }));

      const ranked = rankNextQuestions({
        candidates,
        answers: caseRecord.answers ?? {},
        criticalTokens: critical.criticalTokens,
        winningClusterId: caseRecord.engineResult?.winningClusterId,
        dxCandidates: caseRecord.engineResult?.dxCandidates,
        triggeredRedFlags: caseRecord.engineResult?.triggeredRedFlags,
      });

      const bundle = buildFollowupBundle(
        caseRecord.complaintLabel ?? undefined,
        ranked,
        3
      );
      res.json(
        bundle ?? { title: "No further follow-up needed", questions: [] }
      );
    } catch (err: any) {
      res.status(500).json({
        error: err?.message ?? "Failed to build follow-up bundle",
      });
    }
  }
);
