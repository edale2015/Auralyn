import { Router } from "express";
import { generateCommunicationScript } from "../services/communication/scriptEngine";
import { assignABGroup, getABScript, getABTestStats } from "../services/communication/abTestingEngine";
import { buildCommunicationTrace, getStoredTraces } from "../services/communication/reasoningTrace";
import { updateWeights, getBestVariant, getWeights, getVariantRanking } from "../services/communication/learningEngine";

const router = Router();

router.post("/full-communication", async (req, res) => {
  try {
    const { patientId } = req.body;
    if (!patientId) return res.status(400).json({ error: "patientId required" });

    const base = generateCommunicationScript(req.body);

    const group = assignABGroup(patientId);
    const script = getABScript(group, base.script);

    const trace = buildCommunicationTrace({
      patientId,
      complaint: req.body.complaint || "",
      visitCount: req.body.visitCount || 0,
      demandDetected: !!(req.body.patientText?.toLowerCase?.().includes("zpack") ||
                         req.body.patientText?.toLowerCase?.().includes("antibiotics")),
      bacterialCriteria: !!req.body.hasBacterialCriteria,
      tone: base.tone,
      scriptVariant: base.variant,
    });

    res.json({ script, abGroup: group, trace });
  } catch (err: any) {
    res.status(500).json({ error: "Advanced communication failed" });
  }
});

router.get("/traces", (req, res) => {
  try {
    res.json(getStoredTraces());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/log-outcome", (req, res) => {
  try {
    const { scriptVariant, antibioticsGiven, returnVisit, patientSatisfaction } = req.body;
    if (!scriptVariant) return res.status(400).json({ error: "scriptVariant required" });
    updateWeights({ scriptVariant, antibioticsGiven: !!antibioticsGiven, returnVisit: !!returnVisit, patientSatisfaction });
    res.json({ ok: true, bestVariant: getBestVariant(), weights: getWeights() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/best-variant", (req, res) => {
  res.json({ bestVariant: getBestVariant(), ranking: getVariantRanking() });
});

router.get("/ab-stats", (req, res) => {
  res.json({ message: "Log outcomes to /log-outcome to populate A/B stats" });
});

export default router;
