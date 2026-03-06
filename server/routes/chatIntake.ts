import { Router } from "express";
import { chatSessionService } from "../services/chatSessionService";
import { firestoreCaseStore } from "../services/firestoreCaseStore";

export const chatIntakeRouter = Router();

chatIntakeRouter.post("/start", async (req, res) => {
  try {
    const { complaintId, complaintLabel, patientContext } = req.body ?? {};

    if (!complaintId || typeof complaintId !== "string") {
      return res.status(400).json({ error: "complaintId is required" });
    }

    const session = await chatSessionService.startSession({
      complaintId: complaintId.trim(),
      complaintLabel: complaintLabel?.trim() || undefined,
      patientContext
    });

    res.json(session);
  } catch (err: any) {
    console.error("[ChatIntake] start error:", err);
    res.status(500).json({ error: err?.message ?? "Failed to start session" });
  }
});

chatIntakeRouter.get("/session/:sessionId", async (req, res) => {
  try {
    const session = await chatSessionService.getSession(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }
    res.json(session);
  } catch (err: any) {
    console.error("[ChatIntake] session error:", err);
    res.status(500).json({ error: err?.message ?? "Failed to load session" });
  }
});

chatIntakeRouter.post("/session/:sessionId/answer", async (req, res) => {
  try {
    const { answerText } = req.body ?? {};
    if (!answerText || !String(answerText).trim()) {
      return res.status(400).json({ error: "answerText is required" });
    }

    const session = await chatSessionService.answerQuestion({
      sessionId: req.params.sessionId,
      answerText: String(answerText).trim()
    });

    res.json(session);
  } catch (err: any) {
    console.error("[ChatIntake] answer error:", err);
    const code = err.message?.includes("not found") ? 404 : 500;
    res.status(code).json({ error: err?.message ?? "Failed to submit answer" });
  }
});

chatIntakeRouter.get("/case/:caseId", async (req, res) => {
  try {
    const caseRecord = await firestoreCaseStore.getCase(req.params.caseId);
    if (!caseRecord) {
      return res.status(404).json({ error: "Case not found" });
    }
    res.json(caseRecord);
  } catch (err: any) {
    console.error("[ChatIntake] case error:", err);
    res.status(500).json({ error: err?.message ?? "Failed to load case" });
  }
});
