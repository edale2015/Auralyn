import { Router } from "express";
import {
  previewCanonicalPromotionHandler,
  promoteCanonicalPathwayHandler,
  retireCanonicalPathwayHandler,
  generateCanonicalDraftFromCaseHandler,
} from "../services/kbAdminConsistencyIntegration";
import {
  evaluateGoldenCaseAgainstCanonicalHandler,
  evaluateGoldenCaseBatchAgainstCanonicalHandler,
} from "../services/goldenCaseConsistencyIntegration";
import {
  createPhysicianOverrideHandler,
  listPhysicianOverridesHandler,
} from "../services/physicianOverrideIntegration";
import { listCanonicalPathways, getCanonicalPathway } from "../kb/services/kbWriteService";
import { calculateConfidence, confidenceRationale } from "../services/clinical/confidenceEngine";
import { shouldEscalate } from "../services/monitoring/escalationEngine";
import { checkConsistency } from "../services/clinical/consistencyEngine";
import { handleOverride } from "../services/clinical/overrideEngine";
import { evaluateRisk } from "../services/monitoring/riskGovernanceEngine";

const router = Router();

router.post("/kb-admin/preview-promotion",       previewCanonicalPromotionHandler);
router.post("/kb-admin/promote",                 promoteCanonicalPathwayHandler);
router.post("/kb-admin/retire",                  retireCanonicalPathwayHandler);
router.post("/kb-admin/generate-draft-from-case", generateCanonicalDraftFromCaseHandler);
router.get("/kb-admin/pathways",                 async (req, res) => {
  const { complaintId } = req.query;
  const pathways = await listCanonicalPathways(complaintId as string | undefined);
  res.json({ ok: true, pathways });
});
router.get("/kb-admin/pathways/:pathwayId",      async (req, res) => {
  const pathway = await getCanonicalPathway(req.params.pathwayId);
  if (!pathway) return res.status(404).json({ ok: false, error: "Not found" });
  res.json({ ok: true, pathway });
});

router.post("/golden-cases/evaluate",       evaluateGoldenCaseAgainstCanonicalHandler);
router.post("/golden-cases/evaluate-batch", evaluateGoldenCaseBatchAgainstCanonicalHandler);

router.post("/physician-overrides",  createPhysicianOverrideHandler);
router.get("/physician-overrides",   listPhysicianOverridesHandler);
router.post("/physician-overrides/handle", async (req, res) => {
  try {
    const { physicianDecision, systemDecision, reason } = req.body;
    if (!physicianDecision || !systemDecision || !reason) {
      return res.status(400).json({ error: "physicianDecision, systemDecision, reason required" });
    }
    const result = await handleOverride({ physicianDecision, systemDecision, reason });
    res.json({ ok: true, result });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

router.post("/confidence", (req, res) => {
  try {
    const { probability } = req.body;
    if (probability === undefined) return res.status(400).json({ error: "probability required" });
    const tier      = calculateConfidence(Number(probability));
    const rationale = confidenceRationale(Number(probability));
    res.json({ tier, rationale, probability: Number(probability) });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

router.post("/escalation", (req, res) => {
  try {
    const { riskAlerts, confidence, centorScore } = req.body;
    if (!riskAlerts || !confidence) {
      return res.status(400).json({ error: "riskAlerts and confidence required" });
    }
    const decision = shouldEscalate({ riskAlerts, confidence, centorScore });
    res.json({ ok: true, ...decision });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

router.post("/consistency-check", (req, res) => {
  try {
    const { history, newDecision, threshold } = req.body;
    if (!newDecision || !Array.isArray(history)) {
      return res.status(400).json({ error: "history array and newDecision required" });
    }
    const result = checkConsistency(history, newDecision, threshold);
    res.json({ ok: true, result });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

router.post("/full-risk-escalation", (req, res) => {
  try {
    const { decision, probability, centorScore } = req.body;
    if (!decision || probability === undefined) {
      return res.status(400).json({ error: "decision and probability required" });
    }
    const prob        = Number(probability);
    const riskAlerts  = evaluateRisk({ decision, probability: prob, centorScore });
    const confidence  = calculateConfidence(prob);
    const escalation  = shouldEscalate({ riskAlerts, confidence, centorScore });
    res.json({ ok: true, riskAlerts, confidence, escalation });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

export default router;
