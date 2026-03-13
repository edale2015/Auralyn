import { Router } from "express";
import { computeAdmissionRisk } from "../predictive/riskModelService";
import { getAdmissionRiskFactors, getDeteriorationRiskFactors } from "../predictive/riskFactorLibrary";

const router = Router();

router.post("/api/predictive/admission-risk", (req, res) => {
  try {
    const { complaint, symptoms, caseId } = req.body;
    if (!complaint || !symptoms) return res.status(400).json({ error: "complaint and symptoms are required" });
    const result = computeAdmissionRisk(complaint, symptoms, caseId);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/api/predictive/risk-factors/:complaint", (req, res) => {
  const admission = getAdmissionRiskFactors(req.params.complaint);
  const deterioration = getDeteriorationRiskFactors(req.params.complaint);
  if (admission.length === 0) return res.status(404).json({ error: "No risk factors for this complaint" });
  res.json({ complaint: req.params.complaint, admissionFactors: admission, deteriorationFactors: deterioration });
});

router.get("/api/predictive/complaints", (_req, res) => {
  const complaints = ["chest_pain", "cough", "uti", "fever", "abdominal_pain"];
  res.json({ complaints });
});

export default router;
