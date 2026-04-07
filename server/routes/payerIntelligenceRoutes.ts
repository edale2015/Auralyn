import { Router } from "express";
import { z } from "zod";
import { requireRole } from "../middleware/requireRole";
import { optimizeForPayer, listPayers, getPayerRule } from "../billing/payerEngine";
import { predictDenialV2, buildFeatures } from "../billing/denialClassifierV2";
import { payerAutoFix } from "../billing/payerAutoFix";
import { updatePayerRLHF, getPayerScore, getPayerWeights, getAllPayerStats, getPayerOutcomeLog } from "../learning/payerRLHFEngine";
import { simulateContracts, chooseBestPayer, analyzeContractLeverage } from "../analytics/contractSimulationEngine";
import { getScalingStatus, startAutoScaler, stopAutoScaler, setScalingEnabled } from "../scaling/autoScaler";
import { registerClinic, updateClinicLearning, getClinicProfile, listClinics, getClinicAccuracy, adjustDiagnosisForClinic } from "../ai/clinicLearning";
import { evaluateAndImprove, getImprovementLog, getAgentThresholds, computeBusinessMetrics, startSelfImproveLoop, stopSelfImproveLoop } from "../agents/selfImprove";

const router = Router();

router.get("/payers", requireRole(["admin", "physician"]), (_req, res) => {
  res.json(listPayers());
});

router.get("/payers/:id", requireRole(["admin", "physician"]), (req, res) => {
  const rule = getPayerRule(String(req.params.id));
  if (!rule) return res.status(404).json({ error: "Payer not found" });
  res.json(rule);
});

const optimizeSchema = z.object({
  icd10: z.string().min(1),
  cpt: z.string().min(1),
  payer: z.string().min(1),
  triage: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
});

router.post("/optimize", requireRole(["admin", "physician"]), (req, res) => {
  const parsed = optimizeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { icd10, cpt, payer, triage, confidence } = parsed.data;
  res.json(optimizeForPayer(icd10, cpt, payer, { triage, confidence }));
});

const denialV2Schema = z.object({
  icd10: z.string().min(1),
  cpt: z.string().min(1),
  payer: z.string().min(1),
  confidence: z.number().min(0).max(1).optional(),
  complexity: z.number().min(0).max(1).optional(),
  clinicalNote: z.object({
    hpi: z.string().optional(),
    assessment: z.string().optional(),
    plan: z.string().optional(),
  }).optional(),
});

router.post("/denial-predict", requireRole(["admin", "physician"]), (req, res) => {
  const parsed = denialV2Schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const features = buildFeatures(parsed.data);
  const prediction = predictDenialV2(features);
  res.json({ features, prediction });
});

const fullFlowSchema = z.object({
  icd10: z.string().min(1),
  cpt: z.string().min(1),
  payer: z.string().min(1),
  triage: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  complexity: z.number().min(0).max(1).optional(),
  clinicalNote: z.object({
    hpi: z.string().optional(),
    assessment: z.string().optional(),
    plan: z.string().optional(),
  }).optional(),
});

router.post("/full-flow", requireRole(["admin", "physician"]), (req, res) => {
  const parsed = fullFlowSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { icd10, cpt, payer, triage, confidence, complexity, clinicalNote } = parsed.data;

  const payerOpt = optimizeForPayer(icd10, cpt, payer, { triage, confidence });
  const features = buildFeatures({ icd10, cpt: payerOpt.adjustedCpt || cpt, payer, confidence, complexity, clinicalNote });
  const prediction = predictDenialV2(features);
  const fix = payerAutoFix(payerOpt.adjustedCpt || cpt, payer, prediction, { complexity, icd10 });
  const learnedScore = getPayerScore(icd10, fix.adjustedCpt, payer);
  const bestPayer = chooseBestPayer({ icd10, cpt: fix.adjustedCpt });

  res.json({
    payerOptimization: payerOpt,
    denialPrediction: prediction,
    autoFix: fix,
    learnedScore,
    bestPayer,
  });
});

const outcomeSchema = z.object({
  payer: z.string().min(1),
  icd10: z.string().min(1),
  cpt: z.string().min(1),
  paid: z.boolean(),
  revenue: z.number().min(0),
  denialReasons: z.array(z.string()).optional(),
});

router.post("/payer-outcome", requireRole(["admin"]), (req, res) => {
  const parsed = outcomeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const result = updatePayerRLHF(parsed.data);
  res.json({ logged: true, updatedWeight: result });
});

router.get("/payer-stats", requireRole(["admin", "physician"]), (_req, res) => {
  res.json(getAllPayerStats());
});

router.get("/payer-weights/:payer", requireRole(["admin"]), (req, res) => {
  res.json(getPayerWeights(String(req.params.payer)));
});

router.get("/payer-outcome-log", requireRole(["admin"]), (req, res) => {
  const limit = Number(req.query.limit ?? 100);
  res.json(getPayerOutcomeLog(limit));
});

const simulateSchema = z.object({
  encounters: z.array(z.object({
    icd10: z.string().min(1),
    cpt: z.string().min(1),
  })).min(1).max(1000),
});

router.post("/simulate-contracts", requireRole(["admin"]), (req, res) => {
  const parsed = simulateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  res.json(simulateContracts(parsed.data.encounters));
});

router.post("/best-payer", requireRole(["admin", "physician"]), (req, res) => {
  const { icd10, cpt } = req.body;
  if (!icd10 || !cpt) return res.status(400).json({ error: "icd10 and cpt required" });
  res.json(chooseBestPayer({ icd10, cpt }));
});

router.get("/contract-leverage", requireRole(["admin"]), (_req, res) => {
  res.json(analyzeContractLeverage());
});

router.get("/scaling/status", requireRole(["admin"]), (_req, res) => {
  res.json(getScalingStatus());
});

router.post("/scaling/start", requireRole(["admin"]), (_req, res) => {
  startAutoScaler();
  res.json({ started: true });
});

router.post("/scaling/stop", requireRole(["admin"]), (_req, res) => {
  stopAutoScaler();
  res.json({ stopped: true });
});

router.post("/scaling/toggle", requireRole(["admin"]), (req, res) => {
  const { enabled } = req.body;
  setScalingEnabled(!!enabled);
  res.json({ enabled: !!enabled });
});

const clinicSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(["urgent_care", "primary_care", "pediatric", "telehealth", "specialist", "er"]),
  preferences: z.object({
    triageAggression: z.enum(["conservative", "moderate", "aggressive"]).default("moderate"),
    erReferralThreshold: z.number().min(0).max(1).default(0.7),
    autoSubmitEnabled: z.boolean().default(false),
  }),
});

router.post("/clinics/register", requireRole(["admin"]), (req, res) => {
  const parsed = clinicSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const profile = registerClinic(parsed.data);
  res.json(profile);
});

router.get("/clinics", requireRole(["admin", "physician"]), (_req, res) => {
  res.json(listClinics());
});

router.get("/clinics/:id", requireRole(["admin", "physician"]), (req, res) => {
  const profile = getClinicProfile(String(req.params.id));
  if (!profile) return res.status(404).json({ error: "Clinic not found" });
  res.json({ ...profile, accuracy: getClinicAccuracy(String(req.params.id)) });
});

const clinicOutcomeSchema = z.object({
  clinicId: z.string().min(1),
  diagnosis: z.string().min(1),
  correct: z.boolean(),
  physicianOverride: z.string().optional(),
});

router.post("/clinics/outcome", requireRole(["admin", "physician"]), (req, res) => {
  const parsed = clinicOutcomeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const updated = updateClinicLearning(parsed.data.clinicId, parsed.data);
  if (!updated) return res.status(404).json({ error: "Clinic not found" });
  res.json({ updated: true });
});

router.post("/clinics/:id/adjust-diagnosis", requireRole(["admin", "physician"]), (req, res) => {
  const { diagnoses } = req.body;
  if (!Array.isArray(diagnoses)) return res.status(400).json({ error: "diagnoses array required" });
  res.json(adjustDiagnosisForClinic(String(req.params.id), diagnoses));
});

router.post("/self-improve/run", requireRole(["admin"]), async (_req, res) => {
  const actions = await evaluateAndImprove();
  res.json({ actions, count: actions.length });
});

router.get("/self-improve/log", requireRole(["admin"]), async (req, res) => {
  const limit = Number(req.query.limit ?? 100);
  res.json(await getImprovementLog(limit));
});

router.get("/self-improve/thresholds", requireRole(["admin"]), async (_req, res) => {
  res.json(await getAgentThresholds());
});

router.post("/self-improve/start", requireRole(["admin"]), (_req, res) => {
  startSelfImproveLoop();
  res.json({ started: true });
});

router.post("/self-improve/stop", requireRole(["admin"]), (_req, res) => {
  stopSelfImproveLoop();
  res.json({ stopped: true });
});

const metricsSchema = z.object({
  claims: z.array(z.object({
    revenue: z.number(),
    paid: z.boolean(),
  })).min(1),
});

router.post("/business-metrics", requireRole(["admin"]), (req, res) => {
  const parsed = metricsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  res.json(computeBusinessMetrics(parsed.data.claims));
});

export default router;
