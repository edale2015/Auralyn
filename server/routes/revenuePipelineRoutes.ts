import { Router } from "express";
import { z } from "zod";
import { requireRole } from "../middleware/requireRole";
import { autoFixEncounter } from "../billing/autoFixEngine";
import { logClaimOutcome, getClaimOutcomeStats, getOutcomeLog, getLearnedDenialScore } from "../billing/claimOutcomeLearning";
import { routeToPhysician, registerPhysician, getPhysicianRegistry, detectSpecialty, releasePhysicianLoad } from "../billing/smartPhysicianRouter";
import { calculateRevenueMetrics } from "../billing/revenueAnalytics";
import { autoCodeDiagnosisCluster } from "../billing/diagnosisAutoCoder";
import { predictDenial } from "../billing/denialPredictionEngine";
import { classifyRisk } from "../compliance/riskEngine";

const router = Router();

const autoFixSchema = z.object({
  diagnosis: z.string().min(1),
  differentials: z.array(z.string()).optional().default([]),
  triage: z.string().min(1),
  complaint: z.string().min(1),
  confidence: z.number().min(0).max(1).optional(),
});

router.post("/auto-fix", requireRole(["admin", "physician"]), (req, res) => {
  const parsed = autoFixSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { diagnosis, differentials, triage, complaint, confidence } = parsed.data;

  const coding = autoCodeDiagnosisCluster({ primary: diagnosis, differentials, triage, confidence });
  const risk = classifyRisk({ triage, diagnosis, confidence });
  const denial = predictDenial({
    coding,
    riskClassification: risk,
    encounter: { complaint, diagnosis, triage, confidence },
    clinicalNote: { hpi: `Chief Complaint: ${complaint}`, assessment: `Primary: ${diagnosis}`, plan: `Disposition: ${triage}` },
  });

  const fix = autoFixEncounter(coding, denial, { triage, confidence });

  res.json({
    originalDenialRisk: denial.riskScore,
    fix,
    denialReasons: denial.reasons,
    recommendations: denial.recommendations,
  });
});

const outcomeSchema = z.object({
  encounterId: z.string().min(1),
  icd10: z.string().min(1),
  cptCode: z.string().min(1),
  paid: z.boolean(),
  revenueAmount: z.number().min(0),
  denialReasons: z.array(z.string()).optional(),
});

router.post("/claim-outcome", requireRole(["admin"]), (req, res) => {
  const parsed = outcomeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const entry = logClaimOutcome({ ...parsed.data, timestamp: new Date().toISOString() });
  res.json({ logged: true, updatedWeight: entry });
});

router.get("/claim-outcome/stats", requireRole(["admin", "physician"]), (_req, res) => {
  res.json(getClaimOutcomeStats());
});

router.get("/claim-outcome/log", requireRole(["admin"]), (req, res) => {
  const limit = Number(req.query.limit ?? 100);
  res.json(getOutcomeLog(limit));
});

router.get("/learned-score", requireRole(["admin", "physician"]), (req, res) => {
  const icd10 = req.query.icd10 as string;
  const cpt = req.query.cpt as string;
  if (!icd10 || !cpt) return res.status(400).json({ error: "icd10 and cpt query params required" });
  res.json({ icd10, cpt, learnedDenialScore: getLearnedDenialScore(icd10, cpt) });
});

const routeSchema = z.object({
  icd10Code: z.string().min(1),
  denialRiskScore: z.number().min(0).max(1),
  riskLevel: z.string().min(1),
  confidence: z.number().min(0).max(1).optional(),
});

router.post("/route-physician", requireRole(["admin", "physician"]), (req, res) => {
  const parsed = routeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const decision = routeToPhysician(parsed.data);
  res.json(decision);
});

const physicianSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  specialty: z.string().min(1),
  currentLoad: z.number().min(0).default(0),
  maxLoad: z.number().min(1).default(20),
  available: z.boolean().default(true),
});

router.post("/physicians/register", requireRole(["admin"]), (req, res) => {
  const parsed = physicianSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  registerPhysician(parsed.data);
  res.json({ registered: true, physician: parsed.data });
});

router.get("/physicians", requireRole(["admin", "physician"]), (_req, res) => {
  res.json(getPhysicianRegistry());
});

router.get("/specialty-detect", requireRole(["admin", "physician"]), (req, res) => {
  const icd10 = req.query.icd10 as string;
  if (!icd10) return res.status(400).json({ error: "icd10 query param required" });
  res.json({ icd10, specialty: detectSpecialty(icd10) });
});

router.post("/physicians/:id/release", requireRole(["admin", "physician"]), (req, res) => {
  const released = releasePhysicianLoad(req.params.id);
  if (!released) return res.status(404).json({ error: "Physician not found or load already 0" });
  res.json({ released: true, physicianId: req.params.id });
});

router.get("/revenue", requireRole(["admin"]), (_req, res) => {
  res.json(calculateRevenueMetrics());
});

const fullPipelineSchema = z.object({
  diagnosis: z.string().min(1),
  differentials: z.array(z.string()).optional().default([]),
  triage: z.string().min(1),
  complaint: z.string().min(1),
  confidence: z.number().min(0).max(1).optional(),
  hpiText: z.string().optional(),
});

router.post("/full-pipeline", requireRole(["admin", "physician"]), (req, res) => {
  const parsed = fullPipelineSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { diagnosis, differentials, triage, complaint, confidence, hpiText } = parsed.data;

  const coding = autoCodeDiagnosisCluster({ primary: diagnosis, differentials, triage, confidence });
  const risk = classifyRisk({ triage, diagnosis, confidence });
  const denial = predictDenial({
    coding,
    riskClassification: risk,
    encounter: { complaint, diagnosis, triage, confidence },
    clinicalNote: {
      hpi: hpiText || `Chief Complaint: ${complaint}`,
      assessment: `Primary: ${diagnosis} (ICD-10: ${coding.primary.icd10})`,
      plan: `Disposition: ${triage}`,
    },
  });

  const fix = autoFixEncounter(coding, denial, { triage, confidence });

  const learnedScore = getLearnedDenialScore(coding.primary.icd10, fix.finalCpt);
  const adjustedRisk = Math.round(Math.max(denial.riskScore * (1 - learnedScore * 0.3), 0) * 1000) / 1000;

  const routing = routeToPhysician({
    icd10Code: coding.primary.icd10,
    denialRiskScore: adjustedRisk,
    riskLevel: risk.level,
    confidence,
  });

  res.json({
    coding: { primary: coding.primary, cpt: fix.finalCpt, originalCpt: coding.cpt, codingConfidence: coding.codingConfidence },
    denialPrediction: { riskScore: denial.riskScore, riskLevel: denial.riskLevel, reasons: denial.reasons },
    autoFix: fix,
    adjustedRisk,
    learnedScore,
    routing,
    disposition: routing.autoSubmitEligible ? "AUTO_SUBMIT" : "PHYSICIAN_REVIEW",
  });
});

export default router;
