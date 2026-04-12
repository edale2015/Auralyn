import express from "express";
import { samdDossierService } from "../services/samdDossierService";

const router = express.Router();

/**
 * GET /api/samd/generate
 * Generate a full SaMD FDA submission dossier from live system state.
 */
router.get("/generate", (_req, res) => {
  try {
    const dossier = samdDossierService.generate();
    res.json(dossier);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Dossier generation failed" });
  }
});

export default router;
