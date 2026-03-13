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
import { runReasoningWorker, isWorkerRunning } from "../core/workers/reasoningWorker";
import { extractFeaturesFromAnswer } from "../hybrid-reasoning/followUpEngine";
import { getStreamStats, getEventTimeline, readEventsByCaseId } from "../core/events/eventStream";

const router = Router();

router.post("/message", async (req: Request, res: Response) => {
  const { caseId, message, patient, async: asyncMode } = req.body;
  if (!caseId || !message) return res.status(400).json({ error: "caseId and message required" });

  if (patient) setClinicalState(caseId, { patient });

  try {
    if (asyncMode) {
      runReasoningWorker(caseId).catch(() => {});
      emitClinicalEvent(caseId, "PATIENT_MESSAGE", { message, timestamp: new Date().toISOString() });
      res.json({ ok: true, processing: true, caseId, state: getClinicalState(caseId) });
    } else {
      const state = await runClinicalOrchestrator(caseId, message);
      res.json({ ok: true, state });
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/:caseId/answer", async (req: Request, res: Response) => {
  const { caseId } = req.params;
  const { answer } = req.body;
  if (!answer) return res.status(400).json({ error: "answer required" });

  const state = getClinicalState(caseId);
  const pending = state.pendingQuestion;
  if (!pending) return res.status(400).json({ error: "No pending follow-up question for this case" });

  const extracted = extractFeaturesFromAnswer(pending as any, answer);

  emitClinicalEvent(caseId, "FOLLOWUP_QUESTION_ANSWERED" as ClinicalEventType, {
    questionId: pending.id,
    questionText: pending.text,
    answer,
    featuresExtracted: extracted,
  });

  setClinicalState(caseId, {
    symptoms: ((state.symptoms ?? "") + " " + answer).trim(),
    answeredQuestionIds: [...(state.answeredQuestionIds ?? []), pending.id],
  });

  try {
    const updatedState = await runClinicalOrchestrator(caseId, answer);
    res.json({ ok: true, questionAnswered: pending.id, featuresExtracted: extracted, state: updatedState });
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

router.get("/stream/stats", async (_req: Request, res: Response) => {
  const stats = await getStreamStats();
  res.json(stats);
});

router.get("/stream/events", async (req: Request, res: Response) => {
  const { caseId, limit } = req.query;
  const events = caseId
    ? await readEventsByCaseId(caseId as string)
    : await getEventTimeline();
  const limited = limit ? events.slice(-Number(limit)) : events.slice(-500);
  res.json(limited);
});

router.get("/:caseId", async (req: Request, res: Response) => {
  let state = getClinicalState(req.params.caseId);
  if (state.events.length === 0) {
    const persisted = await loadPersistedState(req.params.caseId);
    if (persisted) state = persisted;
  }
  res.json({ ...state, workerRunning: isWorkerRunning(req.params.caseId) });
});

router.get("/:caseId/events", (req: Request, res: Response) => {
  const { type } = req.query;
  if (type) {
    res.json(getEventsByType(req.params.caseId, type as ClinicalEventType));
  } else {
    res.json(getEventLog(req.params.caseId));
  }
});

router.get("/:caseId/stream", async (req: Request, res: Response) => {
  const events = await readEventsByCaseId(req.params.caseId);
  res.json({ caseId: req.params.caseId, total: events.length, events });
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
