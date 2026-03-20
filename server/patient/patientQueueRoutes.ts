import { Router } from "express";
import { runFullClinicalFlow } from "../orchestrator/clinicalOrchestrator";
import {
  createOrUpsertSession,
  getSessions,
  getSessionById,
  updateSession,
} from "./sessionStorePg";
import { requirePhysician } from "../auth/requirePhysician";
import { logApproval } from "../audit/approvalAudit";
import { notifyOnCallPhysician } from "../notifications/notifier";
import { createTraceId } from "../audit/auditLogger";

const router = Router();

router.get("/queue", async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  const offset = Math.max(Number(req.query.offset ?? 0), 0);
  try {
    const rows = await getSessions(limit, offset);
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

router.get("/session/:id", async (req, res) => {
  try {
    const session = await getSessionById(req.params.id);
    if (!session) return res.status(404).json({ error: "Session not found" });
    res.json(session);
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

router.post("/session", async (req, res) => {
  const traceId = createTraceId();
  const patientId = req.body.patientId || req.body.id || traceId;

  try {
    const result = await runFullClinicalFlow({ ...req.body, patientId });

    const riskLevel = (result as any)?.safetyGate?.level ?? "LOW";
    const safetyFlags = (result as any)?.safetyGate?.reasons ?? [];
    const isBlocked = (result as any)?.blocked === true;

    await createOrUpsertSession({
      id: patientId,
      status: isBlocked ? "blocked" : result.success ? "pending_review" : "failed",
      riskLevel,
      safetyFlags,
      disposition: result,
    });

    if (isBlocked && riskLevel === "HIGH") {
      notifyOnCallPhysician({
        patientId,
        riskLevel: "HIGH",
        reasons: safetyFlags,
        traceId,
      }).catch(console.error);
    }

    console.log(JSON.stringify({
      event: "clinical_flow",
      patientId,
      traceId,
      latency: result.latencyMs,
      status: result.success ? "success" : "blocked",
    }));

    res.json({ ...result, traceId, patientId });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message, traceId });
  }
});

router.post("/approve/:id", requirePhysician as any, async (req: any, res) => {
  const id = req.params.id;
  const physicianId = req.physician?.physicianId ?? req.physician?.sub ?? "unknown";
  try {
    await updateSession(id, { status: "approved", approvedBy: physicianId });
    await logApproval({ patientId: id, physicianId, action: "approve" });
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

router.post("/override/:id", requirePhysician as any, async (req: any, res) => {
  const id = req.params.id;
  const physicianId = req.physician?.physicianId ?? req.physician?.sub ?? "unknown";
  try {
    await updateSession(id, { status: "overridden", approvedBy: physicianId, overrideData: req.body });
    await logApproval({ patientId: id, physicianId, action: "override", overrideData: req.body });
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

router.post("/escalate/:id", requirePhysician as any, async (req: any, res) => {
  const id = req.params.id;
  const physicianId = req.physician?.physicianId ?? req.physician?.sub ?? "unknown";
  try {
    await updateSession(id, { status: "escalated" });
    await logApproval({ patientId: id, physicianId, action: "escalate" });
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

export default router;
