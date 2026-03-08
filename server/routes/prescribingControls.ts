import { Router } from "express";
import { requireRole } from "../middleware/requireRole";
import { createPrescribingRequest, listPrescribingRequests, reviewPrescribingRequest } from "../services/prescribingControlService";
import { logPrescribingAction, getPrescribingAuditLog } from "../services/prescribingAuditLog";

export const prescribingControlsRouter = Router();

prescribingControlsRouter.get("/", requireRole(["admin", "physician"]), async (req, res) => {
  const status = req.query.status as string | undefined;
  res.json({ requests: listPrescribingRequests(status) });
});

prescribingControlsRouter.post("/request", requireRole(["admin", "physician"]), async (req, res) => {
  try {
    const result = createPrescribingRequest({ ...req.body, prescriberId: (req as any).authUser?.userId });
    logPrescribingAction({ caseId: result.caseId, medicationId: result.medicationId, action: "requested", actorId: result.prescriberId });
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err?.message ?? "Failed" }); }
});

prescribingControlsRouter.post("/review", requireRole(["admin", "physician"]), async (req, res) => {
  try {
    const { caseId, medicationId, approved, reason } = req.body;
    const reviewerId = (req as any).authUser?.userId || "unknown";
    const result = reviewPrescribingRequest(caseId, medicationId, approved, reviewerId, reason);
    if (!result) { res.status(404).json({ error: "Request not found" }); return; }
    logPrescribingAction({ caseId, medicationId, action: approved ? "approved" : "denied", actorId: reviewerId, details: reason });
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err?.message ?? "Failed" }); }
});

prescribingControlsRouter.get("/audit", requireRole(["admin"]), async (req, res) => {
  res.json({ entries: getPrescribingAuditLog(req.query.caseId as string | undefined) });
});
