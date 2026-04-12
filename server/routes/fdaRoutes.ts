import express from "express";
import { goldenCaseService } from "../services/goldenCaseService";
import { fdaValidationService } from "../services/fdaValidationService";
import { auditHashChain } from "../services/hashChain";
import { runAllGoldenCases } from "../services/goldenCaseRunner";

const router = express.Router();

/**
 * GET /api/fda/report
 * Generate FDA SaMD readiness report from all completed golden case runs.
 */
router.get("/report", (_req, res) => {
  const runs   = goldenCaseService.listRuns();
  const report = fdaValidationService.generateReport(runs);
  res.json(report);
});

/**
 * POST /api/fda/run-and-report
 * Execute all golden cases then immediately generate the FDA report.
 */
router.post("/run-and-report", async (_req, res) => {
  try {
    const suite  = await runAllGoldenCases();
    const report = fdaValidationService.generateReport(suite.results);
    res.json({ suite, report });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "FDA run failed" });
  }
});

/**
 * GET /api/fda/audit-chain
 * Return the full immutable audit hash chain for tamper verification.
 */
router.get("/audit-chain", (_req, res) => {
  res.json({
    length:  auditHashChain.length(),
    valid:   auditHashChain.verify(),
    latest:  auditHashChain.latest(),
    chain:   auditHashChain.getChain(),
  });
});

/**
 * GET /api/fda/audit-chain/verify
 * Quick tamper-detection check (returns valid:boolean, no full chain dump).
 */
router.get("/audit-chain/verify", (_req, res) => {
  res.json({
    valid:  auditHashChain.verify(),
    length: auditHashChain.length(),
    latest: auditHashChain.latest(),
  });
});

export default router;
