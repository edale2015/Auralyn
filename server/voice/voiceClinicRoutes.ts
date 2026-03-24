import { Router } from "express";
import { handleAutonomousVoiceCall, runVoiceClinic } from "./voiceClinic";

const router = Router();

router.post("/autonomous", handleAutonomousVoiceCall);

router.post("/session", async (req, res) => {
  const { transcripts, userId = "anonymous", caseId } = req.body;
  if (!transcripts || !Array.isArray(transcripts) || !transcripts.length) {
    return res.status(400).json({ ok: false, error: "transcripts[] required" });
  }
  const chunks: any[] = [];
  for await (const chunk of runVoiceClinic(transcripts, userId, caseId)) {
    chunks.push(chunk);
    if (chunk.done || chunk.escalate) break;
  }
  res.json({ ok: true, caseId: chunks[0]?.caseId, chunks });
});

export default router;
