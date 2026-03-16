import { Router, Request, Response } from "express";
import { requireRole } from "../middleware/requireRole";
import { getIntelligenceMap } from "../architecture/intelligenceMapGraph";

const router = Router();

router.get("/api/intelligence-map", requireRole(["admin", "physician"]), (_req: Request, res: Response) => {
  res.json(getIntelligenceMap());
});

export default router;
