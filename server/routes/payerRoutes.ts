import express from "express";
import { payerContractService } from "../services/payerContractService";

const router = express.Router();

/**
 * GET /api/payer/simulate?volume=1000
 * Simulate payer contract economics for a given annual visit volume.
 */
router.get("/simulate", (req, res) => {
  try {
    const volume = Number(req.query.volume ?? 1000);
    res.json(payerContractService.simulateContract(volume));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Simulation failed" });
  }
});

/**
 * POST /api/payer/negotiate
 * Suggest a payer negotiation strategy based on ROI metrics.
 */
router.post("/negotiate", (req, res) => {
  try {
    const result = payerContractService.suggestNegotiation(req.body);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Negotiation strategy failed" });
  }
});

export default router;
