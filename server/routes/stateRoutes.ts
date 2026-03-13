import { Router } from "express";
import { getClinicalState, setClinicalState, clearState, listActiveSessions, loadPersistedState } from "../state/clinicalStateStore";
import { emitClinicalEvent, getEventLog } from "../state/clinicalEventBus";

const router = Router();

router.get("/api/state/sessions", (_req, res) => {
  res.json({ sessions: listActiveSessions() });
});

router.get("/api/state/:caseId", async (req, res) => {
  let state = getClinicalState(req.params.caseId);
  if (!state.sessionId) {
    const persisted = await loadPersistedState(req.params.caseId);
    if (persisted) state = persisted;
  }
  res.json(state);
});

router.post("/api/state/:caseId/event", (req, res) => {
  const { type, data } = req.body;
  if (!type) return res.status(400).json({ error: "type is required" });
  emitClinicalEvent(req.params.caseId, type, data ?? {});
  res.json({ ok: true, state: getClinicalState(req.params.caseId) });
});

router.patch("/api/state/:caseId", (req, res) => {
  const state = setClinicalState(req.params.caseId, req.body);
  res.json(state);
});

router.delete("/api/state/:caseId", (req, res) => {
  clearState(req.params.caseId);
  res.json({ ok: true });
});

router.get("/api/state/:caseId/events", (req, res) => {
  const events = getEventLog(req.params.caseId);
  res.json({ events, count: events.length });
});

export default router;
