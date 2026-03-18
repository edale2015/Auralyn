import { Router, Request, Response } from "express";
import { requireRole } from "../middleware/requireRole";
import {
  listExtendedScoringSystems,
  computeExtendedScore,
  type ExtendedScoringSystemId,
} from "../engines/scoring/index";

const router = Router();

router.get("/systems", requireRole(["admin", "physician"]), (_req: Request, res: Response) => {
  res.json(listExtendedScoringSystems());
});

router.post("/compute/:systemId", requireRole(["admin", "physician"]), (req: Request, res: Response) => {
  try {
    const systemId = req.params.systemId as ExtendedScoringSystemId;
    const result = computeExtendedScore(systemId, req.body);
    res.json({ systemId, result });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/batch", requireRole(["admin", "physician"]), (req: Request, res: Response) => {
  try {
    const { systems, input } = req.body;
    if (!Array.isArray(systems)) {
      return res.status(400).json({ error: "systems must be an array of scoring system IDs" });
    }
    const results: Record<string, any> = {};
    for (const systemId of systems) {
      try {
        results[systemId] = computeExtendedScore(systemId, input);
      } catch {
        results[systemId] = { error: `Unknown system: ${systemId}` };
      }
    }
    res.json({ results });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
