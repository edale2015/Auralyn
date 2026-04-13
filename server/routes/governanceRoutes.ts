/**
 * server/routes/governanceRoutes.ts
 *
 * Updated to await all governanceQueue + modelApproval calls now that they
 * are DB-backed async functions (Batch-1 Finding #1 fix).
 */

import { Router, Request, Response } from "express";
import { requireRole }               from "../auth/requirePhysician";
import {
  listGovernanceQueue,
  addGovernanceItem,
  updateGovernanceStatus,
  getGovernanceStats,
}                                    from "../governance/governanceQueue";
import { reviewClinicalChange }      from "../governance/governanceReviewEngine";
import { runProtocolRegressionTest } from "../governance/protocolRegressionAgent";
import { analyzeClinicalRisk }       from "../governance/clinicalRiskMonitor";
import { checkKnowledgeConsistency } from "../governance/knowledgeConsistencyEngine";
import {
  recordPhysicianFeedback,
  listPhysicianFeedback,
  updateFeedbackStatus,
  getFeedbackStats,
}                                    from "../governance/physicianFeedbackAgent";
import {
  deployNewVersion,
  rollbackVersion,
  getCurrentVersion,
  listVersions,
  getDeploymentStats,
}                                    from "../governance/deploymentManager";
import {
  requireApproval,
  proposeLearningUpdate,
  applyApprovedUpdate,
  rejectUpdate,
  getPendingModelApprovals,
  getModelApprovalStats,
}                                    from "../governance/modelApproval";

const router = Router();

router.get("/api/governance/queue", requireRole(["admin", "physician"]), async (req: Request, res: Response) => {
  try {
    const status = req.query.status as any;
    const sheet  = req.query.sheet as string | undefined;
    const [items, stats] = await Promise.all([
      listGovernanceQueue({ status, sheet }),
      getGovernanceStats(),
    ]);
    res.json({ items, stats });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

router.post("/api/governance/submit", requireRole(["admin"]), async (req: Request, res: Response) => {
  const { sheet, change } = req.body;
  if (!sheet) return res.status(400).json({ error: "sheet is required" });

  try {
    const review = reviewClinicalChange({ sheet, ...change });
    const id     = `gov_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    await addGovernanceItem({
      id, sheet,
      change: change || {},
      risk:   review.risk,
      reason: review.reason,
    });

    res.json({ id, review, autoApprovable: review.autoApprovable });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

router.post("/api/governance/review/:id", requireRole(["admin", "physician"]), async (req: Request, res: Response) => {
  const { id }     = req.params;
  const { status } = req.body;

  if (!["approved", "rejected"].includes(status)) {
    return res.status(400).json({ error: "status must be 'approved' or 'rejected'" });
  }

  try {
    const updated = await updateGovernanceStatus(id, status, req.physician?.id ?? "system");
    if (!updated) return res.status(404).json({ error: "Governance item not found" });
    res.json({ ok: true, id, status });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

router.get("/api/governance/stats", requireRole(["admin"]), async (_req: Request, res: Response) => {
  try {
    res.json(await getGovernanceStats());
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

router.get("/api/governance/regression-test", requireRole(["admin"]), (req: Request, res: Response) => {
  try {
    const max    = req.query.max ? parseInt(req.query.max as string, 10) : 50;
    const result = runProtocolRegressionTest(max);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Regression test failed" });
  }
});

router.post("/api/governance/risk-analysis", requireRole(["admin"]), (req: Request, res: Response) => {
  const alerts = analyzeClinicalRisk(req.body || {});
  res.json({ alerts, alertCount: alerts.length });
});

router.get("/api/governance/consistency-check", requireRole(["admin"]), (_req: Request, res: Response) => {
  try {
    res.json(checkKnowledgeConsistency());
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Consistency check failed" });
  }
});

router.post("/api/governance/feedback", requireRole(["admin", "physician"]), (req: Request, res: Response) => {
  const { caseId, correction, category, severity } = req.body;
  if (!caseId || !correction) {
    return res.status(400).json({ error: "caseId and correction are required" });
  }
  const entry = recordPhysicianFeedback({
    caseId,
    physician: req.physician?.id ?? "unknown",
    correction,
    category:  category  || "other",
    severity:  severity  || "medium",
  });
  res.json(entry);
});

router.get("/api/governance/feedback", requireRole(["admin", "physician"]), (req: Request, res: Response) => {
  const status   = req.query.status   as string | undefined;
  const category = req.query.category as string | undefined;
  const limit    = req.query.limit    ? parseInt(req.query.limit as string, 10) : 100;
  res.json({ items: listPhysicianFeedback({ status, category, limit }), stats: getFeedbackStats() });
});

router.patch("/api/governance/feedback/:id", requireRole(["admin"]), (req: Request, res: Response) => {
  const { status } = req.body;
  if (!["reviewed", "applied", "dismissed"].includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }
  const ok = updateFeedbackStatus(req.params.id, status);
  if (!ok) return res.status(404).json({ error: "Feedback not found" });
  res.json({ ok: true });
});

router.post("/api/governance/deploy", requireRole(["admin"]), (req: Request, res: Response) => {
  const { config, label } = req.body;
  const version = deployNewVersion(config || {}, label, req.physician?.id ?? "system");
  res.json(version);
});

// ── Model approvals ───────────────────────────────────────────────────────────

router.get("/api/governance/model-approvals", requireRole(["admin", "physician"]), async (_req: Request, res: Response) => {
  try {
    const [pending, stats] = await Promise.all([getPendingModelApprovals(), getModelApprovalStats()]);
    res.json({ ok: true, pending, stats });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

router.post("/api/governance/model-approvals/propose", requireRole(["admin"]), async (req: Request, res: Response) => {
  const { packId, oldAccuracy, newAccuracy, source } = req.body;
  if (!packId || oldAccuracy === undefined || newAccuracy === undefined) {
    return res.status(400).json({ error: "packId, oldAccuracy, newAccuracy are required" });
  }
  try {
    const result = await proposeLearningUpdate(packId, oldAccuracy, newAccuracy, source ?? "manual");
    res.json({ ok: true, result });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

router.post("/api/governance/model-approvals/:id/approve", requireRole(["admin", "physician"]), async (req: Request, res: Response) => {
  const reviewedBy = req.physician?.id ?? req.body.reviewedBy ?? "physician";
  try {
    const ok = await applyApprovedUpdate(req.params.id, reviewedBy);
    if (!ok) return res.status(404).json({ error: "Item not found or already resolved" });
    res.json({ ok: true, applied: req.params.id });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

router.post("/api/governance/model-approvals/:id/reject", requireRole(["admin", "physician"]), async (req: Request, res: Response) => {
  const reviewedBy = req.physician?.id ?? req.body.reviewedBy ?? "physician";
  const { reason } = req.body;
  try {
    const ok = await rejectUpdate(req.params.id, reviewedBy, reason);
    if (!ok) return res.status(404).json({ error: "Item not found or already resolved" });
    res.json({ ok: true, rejected: req.params.id });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

router.post("/api/governance/model-approvals/check", requireRole(["admin"]), (req: Request, res: Response) => {
  const { impact } = req.body;
  if (impact === undefined) return res.status(400).json({ error: "impact is required" });
  const result = requireApproval({ oldValue: 0, newValue: impact, impact, source: "manual-check" });
  res.json({ ok: true, result });
});

router.post("/api/governance/rollback", requireRole(["admin"]), (req: Request, res: Response) => {
  const { versionId } = req.body;
  if (!versionId) return res.status(400).json({ error: "versionId is required" });
  const ok = rollbackVersion(versionId);
  if (!ok) return res.status(404).json({ error: "Version not found" });
  res.json({ ok: true, rolledBackTo: versionId });
});

router.get("/api/governance/versions", requireRole(["admin"]), (_req: Request, res: Response) => {
  res.json({ current: getCurrentVersion(), versions: listVersions(), stats: getDeploymentStats() });
});

export default router;
