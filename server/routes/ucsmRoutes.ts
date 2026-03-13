import { Router, Request, Response } from "express";
import {
  getClinicalState,
  setClinicalState,
  clearState,
  listActiveSessions,
  loadPersistedState,
  type ClinicalEventType,
} from "../state/clinicalStateStore";
import { emitClinicalEvent, getEventLog, getEventsByType } from "../state/clinicalEventBus";
import { runClinicalOrchestrator } from "../core/orchestrator/clinicalStateOrchestrator";

const router = Router();

router.post("/message", async (req: Request, res: Response) => {
  const { caseId, message, patient } = req.body;
  if (!caseId || !message) return res.status(400).json({ error: "caseId and message required" });

  if (patient) setClinicalState(caseId, { patient });

  try {
    const state = await runClinicalOrchestrator(caseId, message);
    res.json({ ok: true, state });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/start", (req: Request, res: Response) => {
  const { caseId, patient, complaint } = req.body;
  if (!caseId) return res.status(400).json({ error: "caseId required" });

  const patch: any = {};
  if (patient) patch.patient = patient;
  if (complaint) patch.complaint = complaint;
  setClinicalState(caseId, patch);
  emitClinicalEvent(caseId, "SESSION_STARTED", { patient: patient ?? {}, complaint });
  res.json({ ok: true, state: getClinicalState(caseId) });
});

router.get("/sessions", (_req: Request, res: Response) => {
  res.json(listActiveSessions());
});

router.get("/:caseId", async (req: Request, res: Response) => {
  let state = getClinicalState(req.params.caseId);
  if (state.events.length === 0) {
    const persisted = await loadPersistedState(req.params.caseId);
    if (persisted) state = persisted;
  }
  res.json(state);
});

router.get("/:caseId/events", (req: Request, res: Response) => {
  const { type } = req.query;
  if (type) {
    res.json(getEventsByType(req.params.caseId, type as ClinicalEventType));
  } else {
    res.json(getEventLog(req.params.caseId));
  }
});

router.post("/:caseId/event", (req: Request, res: Response) => {
  const { type, data } = req.body;
  if (!type) return res.status(400).json({ error: "type required" });
  emitClinicalEvent(req.params.caseId, type as ClinicalEventType, data ?? {});
  res.json({ ok: true, state: getClinicalState(req.params.caseId) });
});

router.post("/:caseId/disposition", (req: Request, res: Response) => {
  const { disposition, physicianNote } = req.body;
  if (!disposition) return res.status(400).json({ error: "disposition required" });
  emitClinicalEvent(req.params.caseId, "DISPOSITION_SET", { disposition, physicianNote });
  res.json({ ok: true, state: getClinicalState(req.params.caseId) });
});

router.post("/:caseId/discharge", async (req: Request, res: Response) => {
  const state = getClinicalState(req.params.caseId);
  if (!state.disposition) return res.status(400).json({ error: "Disposition must be set before discharge" });
  emitClinicalEvent(req.params.caseId, "DISCHARGE_READY", {
    text: state.dischargeText ?? `Discharge instructions for case ${req.params.caseId}.`,
  });
  res.json({ ok: true, state: getClinicalState(req.params.caseId) });
});

router.post("/:caseId/outcome", (req: Request, res: Response) => {
  const { actualDisposition, followupStatus, reward } = req.body;
  emitClinicalEvent(req.params.caseId, "OUTCOME_RECORDED", { actualDisposition, followupStatus });
  if (reward !== undefined) emitClinicalEvent(req.params.caseId, "REWARD_COMPUTED", { reward });
  res.json({ ok: true, state: getClinicalState(req.params.caseId) });
});

router.delete("/:caseId", (req: Request, res: Response) => {
  clearState(req.params.caseId);
  res.json({ ok: true });
});

export default router;
