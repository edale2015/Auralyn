import { Router } from "express";
import { firestoreCaseStore } from "../services/firestoreCaseStore";
import { buildChatDispositionExplanation } from "../services/chatDispositionExplainer";
import { requireRole } from "../middleware/requireRole";

export const chatDispositionExplanationRouter = Router();

chatDispositionExplanationRouter.get(
  "/:caseId",
  requireRole(["admin", "physician", "staff", "patient"]),
  async (req, res) => {
    try {
      const caseRecord = await firestoreCaseStore.getCase(req.params.caseId);

      if (!caseRecord) {
        res.status(404).json({ error: "Case not found" });
        return;
      }

      const explanation = buildChatDispositionExplanation(caseRecord);
      res.json(explanation);
    } catch (err: any) {
      res.status(500).json({
        error: err?.message ?? "Failed to build disposition explanation",
      });
    }
  }
);
