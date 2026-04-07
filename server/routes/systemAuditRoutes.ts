import express from "express";
import { requireRole } from "../middleware/requireRole";
import { getTraceSteps, getRecentAuditLogs, verifyEntireChain } from "../audit/auditLogger";

const router = express.Router();

router.get("/trace/:id", requireRole(["admin", "physician"]), async (req, res) => {
  const steps = await getTraceSteps(String(req.params.id));
  res.json(steps);
});

router.get("/recent", requireRole(["admin"]), async (req, res) => {
  const limit = Number(req.query.limit) || 50;
  const logs = await getRecentAuditLogs(limit);
  res.json(logs);
});

// Full chain integrity walk — required for FDA 21 CFR Part 11 audit posture.
// Returns the first broken entry if any tampering or forking is detected.
router.get("/chain-verify", requireRole(["admin"]), async (_req, res) => {
  const result = await verifyEntireChain();
  res.status(result.ok ? 200 : 409).json(result);
});

export default router;
