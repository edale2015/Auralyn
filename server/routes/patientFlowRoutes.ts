import express from "express";
import { startSession, confirmConsent, getSession, listActiveSessions } from "../patient/sessionController";
import { checkScope } from "../patient/scopeGuard";
import { checkEscalation } from "../patient/escalation";
import { runPatientFlow } from "../patient/patientFlow";

const router = express.Router();

router.post("/start", (req, res) => {
  try {
    const session = startSession(req.body);
    res.json({ ok: true, session });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/consent", (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ ok: false, error: "sessionId required" });
    const session = confirmConsent(sessionId);
    if (!session) return res.status(404).json({ ok: false, error: "Session not found" });
    res.json({ ok: true, session });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/session/:sessionId", (req, res) => {
  try {
    const session = getSession(req.params.sessionId);
    if (!session) return res.status(404).json({ ok: false, error: "Session not found" });
    res.json({ ok: true, session });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/sessions", (_req, res) => {
  try {
    res.json({ ok: true, sessions: listActiveSessions() });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/scope-check", (req, res) => {
  try {
    const result = checkScope(req.body);
    res.json({ ok: true, result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/flow", async (req, res) => {
  try {
    const result = await runPatientFlow(req.body);
    res.json({ ok: true, result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
