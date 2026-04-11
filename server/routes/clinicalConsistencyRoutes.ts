import { Router } from "express";
import { runClinicalConsistencyEngine } from "../services/clinicalConsistencyEngine";
import { detectVariance } from "../services/varianceAuditService";
import { validateMedicationBundle } from "../services/medicationConsistencyGuard";
import { scoreSyndromes } from "../services/canonicalSyndromeRules";

const router = Router();

router.post("/run", async (req, res) => {
  try {
    const {
      complaint,
      features,
      clinicianSelectedDisposition,
      clinicianSelectedMedicationKey,
    } = req.body;

    if (!complaint) {
      return res.status(400).json({ ok: false, error: "complaint required" });
    }

    const canonical = runClinicalConsistencyEngine(complaint, features || {});
    const variance = detectVariance({
      canonical,
      clinicianSelectedDisposition,
      clinicianSelectedMedicationKey,
    });

    res.json({ ok: true, canonical, variance });
  } catch (error: any) {
    res.status(500).json({
      ok: false,
      error: error?.message || "Failed to run clinical consistency engine",
    });
  }
});

router.post("/score-syndromes", (req, res) => {
  try {
    const { complaint, features } = req.body;
    if (!complaint) return res.status(400).json({ error: "complaint required" });
    const candidates = scoreSyndromes(complaint, features || {});
    res.json({ ok: true, candidates });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/validate-medications", (req, res) => {
  try {
    const { orders } = req.body;
    if (!Array.isArray(orders)) return res.status(400).json({ error: "orders array required" });
    const result = validateMedicationBundle(orders);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
