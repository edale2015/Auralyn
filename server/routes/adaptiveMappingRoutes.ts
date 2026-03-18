import { Router, Request, Response } from "express";
import { requireRole } from "../middleware/requireRole";
import { auditMiddleware } from "../middleware/auditMiddleware";
import { analyzeWorkbook } from "../engines/workbookIntelligenceEngine";
import { adaptiveMapWorkbook } from "../engines/adaptiveLegacyMapper";
import {
  recordCorrection,
  getRefinementMemory,
  clearRefinementMemory,
} from "../engines/adaptiveMappingRefiner";

const router = Router();
const auth = requireRole(["admin"]);

router.post(
  "/analyze-workbook",
  auth,
  auditMiddleware("ANALYZE_WORKBOOK"),
  (req: Request, res: Response) => {
    try {
      const workbook: Record<string, string[][]> = req.body.workbook || {};
      const analysis = analyzeWorkbook(workbook);
      res.json({ ok: true, analysis });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e.message });
    }
  }
);

router.post(
  "/run-adaptive-mapping",
  auth,
  auditMiddleware("RUN_ADAPTIVE_MAPPING"),
  (req: Request, res: Response) => {
    try {
      const workbook: Record<string, string[][]> = req.body.workbook || {};
      const result = adaptiveMapWorkbook(workbook);
      res.json({ ok: true, ...result });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e.message });
    }
  }
);

router.post("/feedback", auth, (req: Request, res: Response) => {
  const { column, correctType } = req.body;
  if (!column || !correctType) {
    res.status(400).json({ error: "column and correctType required" });
    return;
  }
  recordCorrection(column, correctType);
  res.json({ ok: true, message: "Mapping correction stored" });
});

router.get("/refinement-memory", auth, (_req: Request, res: Response) => {
  res.json(getRefinementMemory());
});

router.post("/refinement-memory/clear", auth, (_req: Request, res: Response) => {
  clearRefinementMemory();
  res.json({ ok: true, message: "Refinement memory cleared" });
});

export default router;
