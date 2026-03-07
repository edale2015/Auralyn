import { Router } from "express";
import { requireRole } from "../middleware/requireRole";
import { analyzeQuestionGaps } from "../services/questionGapAnalyzer";

export const questionGapsRouter = Router();

questionGapsRouter.get(
  "/",
  requireRole(["admin", "physician", "staff"]),
  async (req, res) => {
    try {
      const limit = Number(req.query.limit ?? 200);
      const gaps = await analyzeQuestionGaps(limit);
      res.json({ count: gaps.length, gaps });
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Failed to analyze question gaps" });
    }
  }
);
