import { Router, Request, Response } from "express";
import { requireRole } from "../middleware/requireRole";
import {
  listGovernanceQueue,
  addGovernanceItem,
  updateGovernanceStatus,
  getGovernanceStats,
} from "../governance/governanceQueue";
import { reviewClinicalChange } from "../governance/governanceReviewEngine";
import { runProtocolRegressionTest } from "../governance/protocolRegressionAgent";
import { analyzeClinicalRisk } from "../governance/clinicalRiskMonitor";
import { checkKnowledgeConsistency } from "../governance/knowledgeConsistencyEngine";
import {
  recordPhysicianFeedback,
  listPhysicianFeedback,
  updateFeedbackStatus,
  getFeedbackStats,
} from "../governance/physicianFeedbackAgent";
import {
  deployNewVersion,
  rollbackVersion,
  getCurrentVersion,
  listVersions,
  getDeploymentStats,
} from "../governance/deploymentManager";

const router = Router();

router.get("/api/governance/queue", requireRole(["admin", "physician"]), (req: Request, res: Response) => {
  const status = req.query.status as any;
  const sheet = req.query.sheet as string | undefined;
  res.json({
    items: listGovernanceQueue({ status, sheet }),
    stats: getGovernanceStats(),
  });
});

router.post("/api/governance/submit", requireRole(["admin"]), (req: Request, res: Response) => {
  const { sheet, change } = req.body;
  if (!sheet) return res.status(400).json({ error: "sheet is required" });

  const review = reviewClinicalChange({ sheet, ...change });
  const id = `gov_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  addGovernanceItem({
    id,
    sheet,
    change: change || {},
    risk: review.risk,
    reason: review.reason,
  });

  res.json({
    id,
    review,
    autoApprovable: review.autoApprovable,
  });
});

router.post("/api/governance/review/:id", requireRole(["admin", "physician"]), (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!["approved", "rejected"].includes(status)) {
    return res.status(400).json({ error: "status must be 'approved' or 'rejected'" });
  }

  const updated = updateGovernanceStatus(id, status, req.authUser?.displayName || req.authUser?.email);
  if (!updated) return res.status(404).json({ error: "Governance item not found" });

  res.json({ ok: true, id, status });
});

router.get("/api/governance/stats", requireRole(["admin"]), (_req: Request, res: Response) => {
  res.json(getGovernanceStats());
});

router.get("/api/governance/regression-test", requireRole(["admin"]), (req: Request, res: Response) => {
  try {
    const max = req.query.max ? parseInt(req.query.max as string, 10) : 50;
    const result = runProtocolRegressionTest(max);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Regression test failed" });
  }
});

router.post("/api/governance/risk-analysis", requireRole(["admin"]), (req: Request, res: Response) => {
  const metrics = req.body || {};
  const alerts = analyzeClinicalRisk(metrics);
  res.json({ alerts, alertCount: alerts.length });
});

router.get("/api/governance/consistency-check", requireRole(["admin"]), (_req: Request, res: Response) => {
  try {
    const result = checkKnowledgeConsistency();
    res.json(result);
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
    physician: req.authUser?.displayName || req.authUser?.email || "unknown",
    correction,
    category: category || "other",
    severity: severity || "medium",
  });

  res.json(entry);
});

router.get("/api/governance/feedback", requireRole(["admin", "physician"]), (req: Request, res: Response) => {
  const status = req.query.status as string | undefined;
  const category = req.query.category as string | undefined;
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
  res.json({
    items: listPhysicianFeedback({ status, category, limit }),
    stats: getFeedbackStats(),
  });
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
  const version = deployNewVersion(
    config || {},
    label,
    req.authUser?.displayName || req.authUser?.email
  );
  res.json(version);
});

router.post("/api/governance/rollback", requireRole(["admin"]), (req: Request, res: Response) => {
  const { versionId } = req.body;
  if (!versionId) return res.status(400).json({ error: "versionId is required" });

  const ok = rollbackVersion(versionId);
  if (!ok) return res.status(404).json({ error: "Version not found" });
  res.json({ ok: true, rolledBackTo: versionId });
});

router.get("/api/governance/versions", requireRole(["admin"]), (_req: Request, res: Response) => {
  res.json({
    current: getCurrentVersion(),
    versions: listVersions(),
    stats: getDeploymentStats(),
  });
});

export default router;
