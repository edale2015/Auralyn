import express from "express";
import {
  getRuleGovernanceMetadata,
  getRuleGovernanceMetadataWithStaleWarnings,
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

router.get("/api/platform/rule-governance-metadata/stale", async (_req, res) => {
  try {
    const result = await getRuleGovernanceMetadataWithStaleWarnings();
    const staleKeys = Object.entries(result)
      .filter(([, v]: [string, any]) => v.isStale)
      .map(([key, v]: [string, any]) => ({ key, ...v }));
    res.json({ ok: true, total: Object.keys(result).length, staleCount: staleKeys.length, stale: staleKeys });
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
