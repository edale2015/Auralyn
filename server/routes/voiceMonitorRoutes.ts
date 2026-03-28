import { Router } from "express";
import { getActiveSessions, getCompletedSessions, getVoiceStats } from "../voice/voiceSessionStore";

const router = Router();

router.get("/sessions/active", (_req, res) => {
  res.json({ ok: true, sessions: getActiveSessions() });
});

router.get("/sessions/completed", (req, res) => {
  const limit = Number(req.query.limit) || 20;
  res.json({ ok: true, sessions: getCompletedSessions(limit) });
});

router.get("/stats", (_req, res) => {
  res.json({ ok: true, stats: getVoiceStats() });
});

export default router;
