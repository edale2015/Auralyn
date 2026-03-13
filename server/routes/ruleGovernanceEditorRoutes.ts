import express from "express";
import {
  getRuleGovernanceMetadata,
  updateRuleGovernanceMetadata,
} from "../platform/ruleGovernanceEditorService";

const router = express.Router();

router.get("/api/platform/rule-governance-metadata", async (_req, res) => {
  try {
    const result = await getRuleGovernanceMetadata();
    res.json({ ok: true, result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/api/platform/rule-governance-metadata", async (req, res) => {
  try {
    const result = await updateRuleGovernanceMetadata(req.body);
    res.json({ ok: true, result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
