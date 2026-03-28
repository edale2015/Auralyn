import { Router, Request, Response } from "express";
import { createReview, getDemoReview, getReviewStats, getReviews } from "../clinical/review/physicianReview";
import { computeLiability, getLiabilityLog, getLiabilityStats } from "../clinical/review/liability";
import { updateWeights, getWeightDeltas, getWeightStats } from "../learning/biasAwareRLHF";
import { detectConfirmationBias, getBiasGuardStats } from "../learning/confirmationBiasGuard";
import { handleDrift, isLocked, unlockModel, getDriftState } from "../learning/driftControl";
import { escalationControl, getEscalationStats } from "../clinical/escalationGuard";
import { safeLearning, getSafeLearningStats } from "../learning/safeLearningPipeline";

const router = Router();

// ── Physician Review ──────────────────────────────────────────────────────────
router.post("/review/create", (req: Request, res: Response) => {
  try {
    const review = createReview(req.body);
    res.json(review);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get("/review/list", (_req: Request, res: Response) => {
  res.json(getReviews());
});

router.get("/review/overrides", (_req: Request, res: Response) => {
  res.json(getReviews({ overrideOnly: true }));
});

router.get("/review/demo", (_req: Request, res: Response) => {
  res.json(getDemoReview());
});

router.get("/review/stats", (_req: Request, res: Response) => {
  res.json(getReviewStats());
});

// ── Liability ─────────────────────────────────────────────────────────────────
router.post("/liability/compute", (req: Request, res: Response) => {
  const { encounterId, reviewId, ai, physician, outcome, aiConfidence, overrideReason } = req.body;
  if (!encounterId || !ai || !physician || !outcome) {
    return res.status(400).json({ error: "encounterId, ai, physician, outcome required" });
  }
  res.json(computeLiability({ encounterId, reviewId, ai, physician, outcome, aiConfidence, overrideReason }));
});

router.get("/liability/log", (_req: Request, res: Response) => {
  res.json(getLiabilityLog());
});

router.get("/liability/stats", (_req: Request, res: Response) => {
  res.json(getLiabilityStats());
});

router.get("/liability/demo", (_req: Request, res: Response) => {
  res.json(
    computeLiability({
      encounterId: "ENC-DEMO-002",
      ai: "viral_uri",
      physician: "streptococcal_pharyngitis",
      outcome: "adverse",
      aiConfidence: 0.82,
      overrideReason: "clinical_judgment",
    })
  );
});

// ── Bias-Aware RLHF ───────────────────────────────────────────────────────────
router.post("/learning/weights/update", (req: Request, res: Response) => {
  const { ai, physician, outcome, diagnosisKey, demographics } = req.body;
  if (!ai || !physician || !outcome) {
    return res.status(400).json({ error: "ai, physician, outcome required" });
  }
  res.json(updateWeights({ ai, physician, outcome, diagnosisKey, demographics }));
});

router.get("/learning/weights/deltas", (_req: Request, res: Response) => {
  res.json(getWeightDeltas());
});

router.get("/learning/weights/stats", (_req: Request, res: Response) => {
  res.json(getWeightStats());
});

// ── Confirmation Bias Guard ───────────────────────────────────────────────────
router.post("/learning/bias/check", (req: Request, res: Response) => {
  res.json(detectConfirmationBias(req.body));
});

router.get("/learning/bias/stats", (_req: Request, res: Response) => {
  res.json(getBiasGuardStats());
});

router.get("/learning/bias/demo", (_req: Request, res: Response) => {
  res.json(
    detectConfirmationBias({
      testOrdered: true,
      aiSuggested: true,
      testResult: "streptococcal_pharyngitis",
      aiDiagnosis: "streptococcal_pharyngitis",
    })
  );
});

// ── Drift Circuit Breaker ─────────────────────────────────────────────────────
router.post("/drift/handle", (req: Request, res: Response) => {
  res.json(handleDrift(req.body));
});

router.get("/drift/state", (_req: Request, res: Response) => {
  res.json(getDriftState());
});

router.get("/drift/locked", (_req: Request, res: Response) => {
  res.json({ locked: isLocked() });
});

router.post("/drift/unlock", (req: Request, res: Response) => {
  const { authorizedBy } = req.body;
  if (!authorizedBy) return res.status(400).json({ error: "authorizedBy required" });
  res.json(unlockModel(authorizedBy));
});

router.get("/drift/demo", (_req: Request, res: Response) => {
  res.json(
    handleDrift({ drift: true, metric: "accuracy", baseline: 0.85, current: 0.73, rollbackVersion: "v2.1.0" })
  );
});

// ── Escalation Control ────────────────────────────────────────────────────────
router.get("/escalation/check", (_req: Request, res: Response) => {
  res.json(escalationControl());
});

router.post("/escalation/check", (req: Request, res: Response) => {
  res.json(escalationControl(req.body));
});

router.get("/escalation/stats", (_req: Request, res: Response) => {
  res.json(getEscalationStats());
});

// ── Safe Learning Pipeline ────────────────────────────────────────────────────
router.post("/learning/safe/run", (req: Request, res: Response) => {
  const { ai, physician, outcome, disposition } = req.body;
  if (!ai || !physician || !outcome || !disposition) {
    return res.status(400).json({ error: "ai, physician, outcome, disposition required" });
  }
  res.json(safeLearning(req.body));
});

router.get("/learning/safe/stats", (_req: Request, res: Response) => {
  res.json(getSafeLearningStats());
});

router.get("/learning/safe/demo", (_req: Request, res: Response) => {
  res.json(
    safeLearning({
      ai: "viral_uri",
      physician: "streptococcal_pharyngitis",
      outcome: "confirmed_wrong",
      disposition: "SELF_CARE",
      diagnosisKey: "strep_pharyngitis",
      demographics: { age: 12, sex: "M" },
    })
  );
});

export default router;
