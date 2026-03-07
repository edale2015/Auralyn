import { Router } from "express";
import { requireRole } from "../middleware/requireRole";
import { analyzeOverridePatterns } from "../services/overridePatternAnalyzer";

export const overridePatternsRouter = Router();

overridePatternsRouter.get(
  "/",
  requireRole(["admin", "physician"]),
  async (req, res) => {
    try {
      const limit = Number(req.query.limit ?? 200);
      const patterns = await analyzeOverridePatterns(limit);
      res.json({ count: patterns.length, patterns });
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Failed to analyze override patterns" });
    }
  }
);
