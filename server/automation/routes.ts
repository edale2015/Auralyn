import { Router } from "express";
import {
  runAutomation,
  getAutomationRunDetail,
  listRuns,
  listApprovals,
  approveRunCheckpoint,
  rejectRunCheckpoint,
  listAutomationTemplates,
} from "./automationService";

const router = Router();

router.get("/templates", async (_req, res) => {
  res.json(listAutomationTemplates());
});

router.post("/run", async (req, res) => {
  try {
    const run = await runAutomation({
      templateKey: req.body.templateKey,
      payload: req.body.payload || {},
      clinicId: req.body.clinicId,
      startedBy: req.body.startedBy,
      traceId: (req as any).traceId,
    });
    res.json(run);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Automation failed" });
  }
});

router.get("/runs", async (_req, res) => {
  const rows = await listRuns();
  res.json(rows);
});

router.get("/runs/:runId", async (req, res) => {
  const detail = await getAutomationRunDetail(req.params.runId);
  res.json(detail);
});

router.get("/approvals", async (_req, res) => {
  const rows = await listApprovals();
  res.json(rows);
});

router.post("/approvals/:approvalId/approve", async (req, res) => {
  const row = await approveRunCheckpoint(
    req.params.approvalId,
    req.body?.decidedBy,
    req.body?.notes
  );
  res.json(row);
});

router.post("/approvals/:approvalId/reject", async (req, res) => {
  const row = await rejectRunCheckpoint(
    req.params.approvalId,
    req.body?.decidedBy,
    req.body?.notes
  );
  res.json(row);
});

export default router;
