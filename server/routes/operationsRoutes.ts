import { Router, Request, Response } from "express";
import { requireRole } from "../middleware/requireRole";
import { routeCaseToPhysician, getPhysicians, assignCaseLoad, releaseCaseLoad } from "../services/physicianRouter";
import { getQueue, escalateCases, shouldEscalateCase, getAllCases } from "../services/caseQueue";
import { buildOpsSnapshot } from "../services/opsMetrics";
import { getDemoDrift } from "../services/driftMonitor";
import { evaluateApprovalRule, evaluateBatch } from "../services/approvalRules";
import { getDemoComplaintAnalytics } from "../services/complaintAnalytics";
import { auditChain } from "../services/auditChain";

const router = Router();

router.get("/api/ops/snapshot", requireRole(["admin", "physician"]), (_req: Request, res: Response) => {
  res.json(buildOpsSnapshot());
});

router.get("/api/ops/physicians", requireRole(["admin", "physician"]), (req: Request, res: Response) => {
  const clinicId = req.query.clinicId as string | undefined;
  res.json({ physicians: getPhysicians(clinicId) });
});

router.post("/api/ops/route-case", requireRole(["admin", "physician"]), (req: Request, res: Response) => {
  const { clinicId, complaint, riskLevel, preferredSpecialty } = req.body;
  if (!clinicId || !complaint) return res.status(400).json({ error: "clinicId and complaint required" });
  const physicians = getPhysicians(clinicId);
  const result = routeCaseToPhysician(physicians, { clinicId, complaint, riskLevel: riskLevel || "LOW", preferredSpecialty });
  if (result.assignedPhysicianId) assignCaseLoad(result.assignedPhysicianId);
  res.json(result);
});

router.get("/api/ops/queue", requireRole(["admin", "physician"]), (_req: Request, res: Response) => {
  const queue = getQueue();
  const allCases = getAllCases();
  res.json({
    queue,
    stats: {
      total: allCases.length,
      pending: allCases.filter((c) => c.status === "pending").length,
      escalated: allCases.filter((c) => c.status === "escalated").length,
      reviewed: allCases.filter((c) => c.status === "reviewed").length,
    },
  });
});

router.post("/api/ops/escalate", requireRole(["admin", "physician"]), (_req: Request, res: Response) => {
  const result = escalateCases();
  res.json({ scanned: result.scanned, escalatedCount: result.escalated.length, escalated: result.escalated });
});

router.get("/api/ops/drift", requireRole(["admin", "physician"]), (_req: Request, res: Response) => {
  res.json(getDemoDrift());
});

router.post("/api/ops/approval-check", requireRole(["admin", "physician"]), (req: Request, res: Response) => {
  const input = req.body;
  if (Array.isArray(input)) {
    res.json(evaluateBatch(input));
  } else {
    res.json(evaluateApprovalRule(input));
  }
});

router.get("/api/ops/complaint-analytics", requireRole(["admin", "physician"]), (_req: Request, res: Response) => {
  res.json({ complaints: getDemoComplaintAnalytics() });
});

router.get("/api/ops/audit-chain", requireRole(["admin"]), (_req: Request, res: Response) => {
  res.json({ chain: auditChain.getChain(), summary: auditChain.getSummary() });
});

router.post("/api/ops/audit-chain/append", requireRole(["admin", "physician"]), (req: Request, res: Response) => {
  const { caseId, action, payload } = req.body;
  const authUser = (req as any).authUser;
  const userId = authUser?.userId || "system";
  const allowedActions = ["batch_approve", "override", "review", "escalate", "manual"];
  const safeAction = allowedActions.includes(action) ? action : "manual";
  const entry = auditChain.append(caseId || "unknown", userId, safeAction, payload || {});
  res.json(entry);
});

router.get("/api/ops/audit-chain/verify", requireRole(["admin"]), (_req: Request, res: Response) => {
  res.json(auditChain.verify());
});

export default router;
