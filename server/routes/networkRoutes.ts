/**
 * National Hospital Network API Routes
 * Hospital network optimization, national EMS routing, network learning,
 * payer optimization, and deployment planning.
 */

import { Router } from "express";
import { requireRole } from "../middleware/requireRole";
import { routeNationwide } from "../network/nationalRoutingEngine";
import { updateNetworkLearning, getWeightSummary } from "../network/networkLearningEngine";
import { optimizePayerStrategy } from "../payer/payerOptimizationEngine";
import { generateNegotiationStrategy } from "../payer/contractNegotiator";
import { prioritizeExpansion, generateDeploymentTimeline } from "../deployment/deploymentEngine";

const router = Router();

/** GET /api/network/status — network node status and payer summary */
router.get("/status", requireRole("physician"), (_req, res) => {
  const weights = getWeightSummary();
  res.json({
    networkLearning: weights,
    status: "operational",
    instanceCount: 1,
    timestamp: new Date().toISOString(),
  });
});

/** POST /api/network/route — route patient to optimal national facility */
router.post("/route", requireRole("physician"), (req, res) => {
  const { patient, facilities } = req.body;
  if (!patient || !Array.isArray(facilities)) {
    return res.status(400).json({ error: "patient and facilities[] required" });
  }
  const ranked = routeNationwide(patient, facilities);
  res.json({ topChoice: ranked[0] ?? null, alternatives: ranked.slice(1, 5) });
});

/** POST /api/network/learn — submit outcome feedback to update network weights */
router.post("/learn", requireRole("physician"), (req, res) => {
  const { outcomes } = req.body;
  if (!Array.isArray(outcomes)) {
    return res.status(400).json({ error: "outcomes[] required" });
  }
  const updated = updateNetworkLearning(outcomes);
  res.json({ updated: Object.keys(updated).length, weights: updated });
});

/** POST /api/network/payer — payer strategy optimization */
router.post("/payer", requireRole("physician"), (req, res) => {
  const { claims } = req.body;
  if (!Array.isArray(claims)) {
    return res.status(400).json({ error: "claims[] required" });
  }
  const stats = optimizePayerStrategy(claims);
  const strategies = generateNegotiationStrategy(stats);
  res.json({ stats, strategies });
});

/** POST /api/network/deploy — deployment prioritization for clinic expansion */
router.post("/deploy", requireRole("physician"), (req, res) => {
  const { clinics } = req.body;
  if (!Array.isArray(clinics)) {
    return res.status(400).json({ error: "clinics[] required" });
  }
  const plans  = prioritizeExpansion(clinics);
  const timeline = generateDeploymentTimeline(plans);
  res.json({ plans: plans.slice(0, 20), timeline });
});

export default router;
