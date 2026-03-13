import { Router } from "express";
import { startIntakeSession, processIntakeMessage, getIntakeSession, listSessions } from "../intake/autonomousIntakeEngine";

const router = Router();

router.get("/api/autonomous-intake/sessions", (_req, res) => {
  res.json({ sessions: listSessions() });
});

router.post("/api/autonomous-intake/start", async (req, res) => {
  try {
    const { caseId, patientInfo } = req.body;
    if (!caseId) return res.status(400).json({ error: "caseId is required" });
    const result = await startIntakeSession(caseId, patientInfo);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/api/autonomous-intake/message", async (req, res) => {
  try {
    const { caseId, message } = req.body;
    if (!caseId || !message) return res.status(400).json({ error: "caseId and message are required" });
    const result = await processIntakeMessage({ caseId, message });
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/api/autonomous-intake/session/:caseId", (req, res) => {
  const session = getIntakeSession(req.params.caseId);
  if (!session) return res.status(404).json({ error: "Session not found" });
  res.json(session);
});

export default router;
