import express from "express";
import { runClinicalDecision } from "../services/clinical/clinicalDecisionEngine";
import { runAntibioticDebateV2 } from "../services/communication/debateEngine";
import { generateVoiceMessage, speakToPatient } from "../services/communication/voiceService";

const router = express.Router();

/**
 * POST /api/full-pipeline
 * Unified clinical decision pipeline: Centor + Bayesian + Debate + optional Voice.
 */
router.post("/full-pipeline", async (req, res) => {
  try {
    const { symptoms, phone } = req.body;

    if (!symptoms) {
      res.status(400).json({ error: "symptoms object required" });
      return;
    }

    const clinical = runClinicalDecision(symptoms);

    const debate = runAntibioticDebateV2({
      centorScore: clinical.centorScore,
      probability: clinical.probability,
    });

    const voiceMessage = phone ? generateVoiceMessage(debate.decision) : undefined;

    if (phone && voiceMessage) {
      try {
        await speakToPatient(phone, voiceMessage);
      } catch {
        // Voice is best-effort — clinical decision is not blocked by Twilio failures
      }
    }

    res.json({
      clinical,
      debate,
      finalDecision: debate.decision,
      ...(voiceMessage && { voiceMessageSent: true, voiceMessage }),
    });
  } catch (err: any) {
    console.error("[FullClinicalPipeline] Error:", err?.message);
    res.status(500).json({ error: "Pipeline failed", detail: err?.message });
  }
});

export default router;
