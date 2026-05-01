import { Router } from "express";
import { requireRole } from "../middleware/requireRole";
import { requireReviewAuth } from "../middleware/reviewAuth";
import { processPhysicianFeedback, getRlhfStatus } from "../clinical/rlhfAutoLearner";
import { validateRuleMap } from "../clinical/ruleMapValidator";
import { exportRuleMapToSheets } from "../scripts/exportRuleMapToSheets";

const router = Router();
const auth = [requireReviewAuth, requireRole(["admin", "physician"])];

router.post("/process-feedback", ...auth, async (_req, res) => {
  try {
    const result = await processPhysicianFeedback();
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get("/learning-status", ...auth, async (_req, res) => {
  try {
    const status = await getRlhfStatus();
    res.json(status);
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post("/validate-rules", ...auth, async (_req, res) => {
  try {
    const result = await validateRuleMap();
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post("/export-rule-map", ...auth, async (_req, res) => {
  try {
    const result = await exportRuleMapToSheets();
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
