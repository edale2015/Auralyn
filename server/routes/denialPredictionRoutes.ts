import { Router } from "express";
import { z } from "zod";
import { requireRole } from "../middleware/requireRole";
import { predictDenial, batchPredictDenials } from "../billing/denialPredictionEngine";
import { autoCodeDiagnosisCluster } from "../billing/diagnosisAutoCoder";
import { classifyRisk } from "../compliance/riskEngine";

const router = Router();

const predictSchema = z.object({
  diagnosis: z.string().min(1),
  differentials: z.array(z.string()).optional().default([]),
  triage: z.string().min(1),
  complaint: z.string().min(1),
  confidence: z.number().min(0).max(1).optional(),
  hpiText: z.string().optional().default(""),
  planText: z.string().optional().default(""),
});

router.post("/predict", requireRole(["admin", "physician"]), (req, res) => {
  const parsed = predictSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message, details: parsed.error.issues });
  }
  const { diagnosis, differentials, triage, complaint, confidence, hpiText, planText } = parsed.data;

  const coding = autoCodeDiagnosisCluster({ primary: diagnosis, differentials, triage, confidence });
  const risk = classifyRisk({ triage, diagnosis, confidence });

  const prediction = predictDenial({
    coding,
    riskClassification: risk,
    encounter: { complaint, diagnosis, triage, confidence },
    clinicalNote: {
      hpi: hpiText || `Chief Complaint: ${complaint}`,
      assessment: `Primary: ${diagnosis}`,
      plan: planText || `Disposition: ${triage}`,
    },
  });

  res.json({
    prediction,
    coding: {
      primary: coding.primary,
      cpt: coding.cpt,
      codingConfidence: coding.codingConfidence,
    },
  });
});

const batchSchema = z.object({
  encounters: z.array(predictSchema).min(1, "encounters[] required"),
});

router.post("/predict-batch", requireRole(["admin"]), (req, res) => {
  const parsed = batchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message, details: parsed.error.issues });
  }

  const inputs = parsed.data.encounters.map((e) => {
    const coding = autoCodeDiagnosisCluster({ primary: e.diagnosis, differentials: e.differentials, triage: e.triage, confidence: e.confidence });
    const risk = classifyRisk({ triage: e.triage, diagnosis: e.diagnosis, confidence: e.confidence });
    return {
      coding,
      riskClassification: risk,
      encounter: { complaint: e.complaint, diagnosis: e.diagnosis, triage: e.triage, confidence: e.confidence },
      clinicalNote: {
        hpi: e.hpiText || `Chief Complaint: ${e.complaint}`,
        assessment: `Primary: ${e.diagnosis}`,
        plan: e.planText || `Disposition: ${e.triage}`,
      },
    };
  });

  const result = batchPredictDenials(inputs);
  res.json(result);
});

export default router;
