import { Router } from "express";
import { getPatientHistory, extractPatientPatterns, recordPatientVisit } from "../services/learning/patientMemoryService";
import { personalizeDecision } from "../services/learning/personalizationEngine";
import { getClinicThreshold, updatePopulationStats, resetClinicThreshold } from "../services/learning/populationLearningEngine";

const router = Router();

router.post("/enhanced-decision", async (req, res) => {
  try {
    const { patientId, clinicId, baseProbability, comorbidities } = req.body;

    if (!patientId || baseProbability === undefined) {
      return res.status(400).json({ error: "patientId and baseProbability required" });
    }

    const history   = await getPatientHistory(patientId);
    const pattern   = extractPatientPatterns(history);
    const threshold = getClinicThreshold(clinicId || "default");

    const personalization = personalizeDecision({
      baseProbability:  Number(baseProbability),
      comorbidities:    Array.isArray(comorbidities) ? comorbidities : [],
      patientPattern:   pattern,
    });

    const decision =
      personalization.adjustedProbability > threshold
        ? "CONSIDER_ANTIBIOTIC"
        : "NO_ANTIBIOTIC";

    res.json({
      adjustedProbability:  personalization.adjustedProbability,
      appliedAdjustments:   personalization.appliedAdjustments,
      threshold,
      decision,
      pattern,
    });
  } catch (err: any) {
    res.status(500).json({ error: "Learning pipeline failed", detail: err?.message });
  }
});

router.post("/record-visit", async (req, res) => {
  try {
    const { patientId, complaint, antibioticsGiven, improvedWithAntibiotics, returnVisit } = req.body;
    if (!patientId) return res.status(400).json({ error: "patientId required" });
    await recordPatientVisit({ patientId, complaint: complaint || "", antibioticsGiven: !!antibioticsGiven, improvedWithAntibiotics, returnVisit });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

router.get("/patient-history/:patientId", async (req, res) => {
  try {
    const history  = await getPatientHistory(req.params.patientId);
    const patterns = extractPatientPatterns(history);
    res.json({ history, patterns });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

router.post("/update-population-stats", async (req, res) => {
  try {
    const { clinicId, antibioticSuccessRate, returnVisitRate } = req.body;
    if (!clinicId) return res.status(400).json({ error: "clinicId required" });
    await updatePopulationStats({ clinicId, antibioticSuccessRate: Number(antibioticSuccessRate || 0.5), returnVisitRate: Number(returnVisitRate || 0.1) });
    const threshold = getClinicThreshold(clinicId);
    res.json({ ok: true, threshold });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

router.get("/clinic-threshold/:clinicId", (req, res) => {
  const threshold = getClinicThreshold(req.params.clinicId);
  res.json({ clinicId: req.params.clinicId, threshold });
});

router.post("/reset-clinic-threshold", (req, res) => {
  const { clinicId, value } = req.body;
  if (!clinicId) return res.status(400).json({ error: "clinicId required" });
  resetClinicThreshold(clinicId, value);
  res.json({ ok: true, threshold: getClinicThreshold(clinicId) });
});

export default router;
