import { Router } from "express";
import { calculateCentorScore, centorDecision, centorRationale } from "../services/clinical/centorEngine";
import { calculateStrepProbability, strepRiskLabel, strepTreatmentRecommendation } from "../services/clinical/bayesianStrepEngine";
import { runAntibioticDebate } from "../services/communication/debateEngine";
import { buildPatientVoiceMessage, isTwilioConfigured } from "../services/communication/voiceService";

const router = Router();

router.post("/full-decision", async (req, res) => {
  try {
    const { symptoms, phone } = req.body;
    if (!symptoms) return res.status(400).json({ error: "symptoms required" });

    const centorScore  = calculateCentorScore(symptoms);
    const centorResult = centorDecision(centorScore);
    const rationale    = centorRationale(centorScore);

    const probability = calculateStrepProbability({
      fever:   symptoms.fever,
      exudate: symptoms.tonsillarExudate,
      nodes:   symptoms.tenderAnteriorCervicalNodes,
      cough:   symptoms.cough,
    });

    const riskLabel = strepRiskLabel(probability);
    const recommendation = strepTreatmentRecommendation(probability, centorScore);

    const debate = runAntibioticDebate({ centorScore, strepProbability: probability });

    const voiceMessage = buildPatientVoiceMessage(centorResult, debate.decision);
    let voiceResult: any = null;

    if (phone && isTwilioConfigured()) {
      try {
        const { speakToPatient } = await import("../services/communication/voiceService");
        voiceResult = await speakToPatient(phone, voiceMessage);
      } catch (vErr: any) {
        voiceResult = { error: vErr.message };
      }
    }

    res.json({
      centorScore,
      centorResult,
      centorRationale: rationale,
      strepProbability: probability,
      strepRiskLabel: riskLabel,
      recommendation,
      debate: {
        decision: debate.decision,
        reasoning: debate.reasoning,
        pro: debate.proArguments,
        con: debate.conArguments,
        confidence: debate.confidence,
      },
      voiceMessage,
      voiceDelivered: !!voiceResult && !voiceResult.error,
      voiceResult,
    });
  } catch (err: any) {
    res.status(500).json({ error: "Decision pipeline failed", detail: err.message });
  }
});

router.post("/centor", (req, res) => {
  try {
    const { symptoms } = req.body;
    if (!symptoms) return res.status(400).json({ error: "symptoms required" });
    const score    = calculateCentorScore(symptoms);
    const decision = centorDecision(score);
    const rationale = centorRationale(score);
    res.json({ score, decision, rationale });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/strep-probability", (req, res) => {
  try {
    const { fever, exudate, nodes, cough } = req.body;
    const prob  = calculateStrepProbability({ fever: !!fever, exudate: !!exudate, nodes: !!nodes, cough: !!cough });
    const label = strepRiskLabel(prob);
    res.json({ probability: prob, riskLabel: label });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/debate", (req, res) => {
  try {
    const { centorScore, strepProbability } = req.body;
    if (centorScore === undefined || strepProbability === undefined) {
      return res.status(400).json({ error: "centorScore and strepProbability required" });
    }
    const result = runAntibioticDebate({ centorScore, strepProbability });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
