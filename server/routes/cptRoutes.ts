import express from "express";
import { generateCPT } from "../billing/cptEngine";

const router = express.Router();

/**
 * POST /api/cpt/generate
 * Generate a CPT E&M code from clinical workflow output (riskLevel, diagnosis, disposition).
 */
router.post("/generate", (req, res) => {
  try {
    const cpt = generateCPT(req.body);
    res.json(cpt);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "CPT generation failed" });
  }
});

export default router;
