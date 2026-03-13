import { Router, Request, Response } from "express";
import {
  generateGoldenCasesFromReconciliations,
  listGeneratedGoldenCases,
} from "../learning/goldenCaseAutoGenerator";

const router = Router();

router.post(
  "/api/skill-layer/learning/generate-golden-cases",
  async (_req: Request, res: Response) => {
    try {
      const result = await generateGoldenCasesFromReconciliations();
      res.json({ ok: true, result });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message ?? "unknown_error" });
    }
  }
);

router.get(
  "/api/skill-layer/learning/generated-golden-cases",
  async (_req: Request, res: Response) => {
    try {
      const cases = await listGeneratedGoldenCases();
      res.json({ ok: true, cases });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message ?? "unknown_error" });
    }
  }
);

export default router;
