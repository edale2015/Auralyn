import { Router } from "express";
import { generateCommunicationScript, isRepeatVisitTrigger } from "../services/communication/scriptEngine";
import { detectTone, detectToneScore } from "../services/communication/toneDetector";
import { getScriptVariant, listVariantNames } from "../services/communication/scriptVariants";
import { logCommunicationOutcome, getCommunicationStats } from "../services/communication/outcomeTracker";

const router = Router();

router.post("/generate-script", (req, res) => {
  try {
    const result = generateCommunicationScript(req.body);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ ok: false, error: "Script generation failed", detail: err.message });
  }
});

router.post("/detect-tone", (req, res) => {
  try {
    const { text } = req.body;
    if (typeof text !== "string") {
      return res.status(400).json({ ok: false, error: "text (string) required" });
    }
    res.json({ tone: detectTone(text), scores: detectToneScore(text) });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/check-trigger", (req, res) => {
  try {
    const { complaint, visitCount, durationDays } = req.body;
    const triggered = isRepeatVisitTrigger({ complaint, visitCount, durationDays });
    res.json({ triggered });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/variant", (req, res) => {
  try {
    const variant = getScriptVariant(req.body);
    res.json(variant);
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/variants", (_req, res) => {
  res.json({ variants: listVariantNames() });
});

router.post("/log-outcome", async (req, res) => {
  try {
    const result = await logCommunicationOutcome(req.body);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/stats", (_req, res) => {
  try {
    res.json(getCommunicationStats());
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
